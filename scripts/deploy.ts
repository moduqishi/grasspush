import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const dbName = process.env.D1_DATABASE_NAME || 'grasspush-db';
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const projectName = process.env.PROJECT_NAME || 'grasspush';

const setupWranglerConfig = () => {
    const wranglerExamplePath = path.resolve('wrangler.example.json');
    const wranglerConfigPath = path.resolve('wrangler.json');

    const wranglerConfig = fs.readFileSync(wranglerExamplePath, 'utf-8');
    const json = JSON.parse(wranglerConfig);
    json.d1_databases[0].database_name = dbName;
    json.name = projectName;
    fs.writeFileSync(wranglerConfigPath, JSON.stringify(json, null, 2));
};

const checkAndCreateDatabase = () => {
    let dbId;

    const getDatabaseId = () => {
        const dbList = execSync('wrangler d1 list --json').toString();
        const databases = JSON.parse(dbList);
        return databases.find((db: any) => db.name === dbName)?.uuid;
    }

    try {
        dbId = getDatabaseId();
    } catch (error) {
        console.error('Error listing databases:', error);
    }

    if (!dbId) {
        console.log(`Creating new D1 database: ${dbName}`);
        execSync(`wrangler d1 create "${dbName}"`);
        dbId = getDatabaseId();
        if (!dbId) {
            throw new Error('Failed to create database');
        }
    } else {
        console.log(`Database ${dbName} already exists`);
    }

    const wranglerConfigPath = path.resolve('wrangler.json');
    const wranglerConfig = JSON.parse(fs.readFileSync(wranglerConfigPath, 'utf-8'));
    wranglerConfig.d1_databases[0].database_id = dbId;
    fs.writeFileSync(wranglerConfigPath, JSON.stringify(wranglerConfig, null, 2));
};

const applyMigrations = () => {
    execSync(`wrangler d1 migrations apply "${dbName}" --remote`);
};

const createPagesSecret = () => {
    const envFilePath = path.resolve('.env');
    const envVariables = [
        `AUTH_SECRET=${process.env.AUTH_SECRET}`,
        `AUTH_GITHUB_ID=${process.env.AUTH_GITHUB_ID}`,
        `AUTH_GITHUB_SECRET=${process.env.AUTH_GITHUB_SECRET}`,
        `DISABLE_REGISTER=${process.env.DISABLE_REGISTER}`,
    ];
    fs.writeFileSync(envFilePath, envVariables.join('\n'));
    execSync(`wrangler pages secret bulk .env`);
};

const deployPages = () => {
    console.log('Deploying to Cloudflare Pages...');
    execSync('pnpm run deploy');
    console.log('Deployment completed successfully');
};

const checkProjectExists = async () => {
    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${cloudflareApiToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok && response.status === 404) {
            console.log(`Project ${projectName} does not exist. Creating...`);
            await createProject();
        } else {
            console.log(`Project ${projectName} already exists.`);
        }
    } catch (error) {
        console.error('Error checking project existence:', error);
        throw error;
    }
};

const createProject = async () => {
    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${cloudflareApiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: projectName,
                production_branch: 'main',
            }),
        });

        if (!response.ok) {
            throw new Error(`Error creating project: ${response.statusText}`);
        }

        const data = await response.json() as { success: boolean, result: { name: string } };
        
        if (!data.success) {
            throw new Error('Failed to create project');
        }

        // 等待项目创建完成
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 验证项目是否真正创建成功
        const verifyResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`,
            {
                headers: {
                    Authorization: `Bearer ${cloudflareApiToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!verifyResponse.ok) {
            throw new Error('Project creation verification failed');
        }

        const verifyData = await verifyResponse.json() as { success: boolean };
        if (!verifyData.success) {
            throw new Error('Project creation could not be verified');
        }

        console.log(`Project ${projectName} created and verified successfully`);
    } catch (error) {
        console.error('Error creating project:', error);
        throw error;
    }
};

const main = async () => {
    try {
        setupWranglerConfig();
        await checkProjectExists();
        checkAndCreateDatabase();
        applyMigrations();
        createPagesSecret();
        deployPages();

        console.log('🎉 All deployment steps completed successfully!');
    } catch (error) {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }
};

main();