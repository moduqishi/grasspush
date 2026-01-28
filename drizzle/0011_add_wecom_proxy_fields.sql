-- 添加企业微信域名验证和 SOCKS5 代理字段
ALTER TABLE channels ADD COLUMN wecom_verify_filename TEXT;
ALTER TABLE channels ADD COLUMN wecom_verify_content TEXT;
ALTER TABLE channels ADD COLUMN socks5_proxy TEXT;
