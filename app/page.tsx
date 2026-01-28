import { Button } from "@/components/ui/button";
import { ArrowRight, MessageSquare, Zap, Shield, Heart, Sparkles } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";

export const runtime = "edge";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50 to-indigo-50">
      <SiteHeader user={session?.user} variant="home" />

      <main className="flex-1">
        <section className="relative overflow-hidden min-h-screen flex items-center">
          <div className="container flex max-w-[64rem] flex-col items-center gap-4 text-center pt-14 pb-24 md:pb-32">
            <div className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-600">
              <span className="inline-block animate-bounce mr-2">✨</span>
              <Link href="https://github.com/beilunyang/moepush" target="_blank" rel="noreferrer">
                MoePush 现已开源
              </Link>
              <span className="inline-block animate-bounce ml-2">✨</span>
            </div>
            <h1 className="font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
                可爱又强大的
              </span>
              <br />
              消息推送服务
            </h1>
            <p className="max-w-[42rem] leading-normal text-gray-600 sm:text-xl sm:leading-8">
              支持多种消息推送方式，让您的通知变得更加简单~
            </p>
            <div className="space-x-4">
              <Link href="/moe">
                <Button size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 gap-2 transition-all duration-300">
                  立即开始 <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* 添加可爱的装饰图案 */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 w-64 h-64 bg-gradient-to-r from-blue-300 to-indigo-300 rounded-full filter blur-3xl opacity-20 animate-blob" />
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-64 h-64 bg-gradient-to-r from-indigo-300 to-blue-300 rounded-full filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
          </div>
        </section>

        <section className="container space-y-6 py-8 md:py-12 lg:py-24 min-h-screen flex flex-col justify-center">
          <div className="mx-auto flex max-w-[64rem] flex-col items-center space-y-4 text-center">
            <Sparkles className="h-12 w-12 text-blue-500 animate-pulse" />
            <h2 className="font-bold text-3xl leading-[1.1] sm:text-3xl md:text-6xl bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
              萌萌哒的功能
            </h2>
            <p className="max-w-[85%] leading-normal text-gray-600 sm:text-lg sm:leading-7">
              为您的应用提供强大而实用的消息推送能力
            </p>
          </div>

          <div className="mx-auto grid justify-center gap-8 max-w-[64rem] md:grid-cols-2">
            {[
              {
                icon: <MessageSquare className="h-8 w-8 text-blue-500" />,
                title: "多渠道支持",
                description: "支持多种消息推送渠道，包括钉钉机器人、企业微信应用等"
              },
              {
                icon: <Zap className="h-8 w-8 text-indigo-500" />,
                title: "简单易用",
                description: "超级简单的接口调用，支持多种消息模板，快速集成"
              },
              {
                icon: <Shield className="h-8 w-8 text-blue-400" />,
                title: "安全可靠",
                description: "消息安全有保障，支持签名验证，保护您的消息安全"
              },
              {
                icon: <Heart className="h-8 w-8 text-indigo-400" />,
                title: "开源免费",
                description: "基础功能完全免费使用，代码开源，欢迎贡献"
              }
            ].map((feature, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white/50 p-8 hover:shadow-lg hover:shadow-blue-100/50 transition-all duration-300"
              >
                <div className="flex flex-col gap-4">
                  <div className="p-2 w-fit rounded-xl bg-blue-50 ring-1 ring-blue-100">
                    {feature.icon}
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-600">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="container space-y-6 py-8 md:py-12 lg:py-24 min-h-screen flex flex-col justify-center">
          <div className="mx-auto flex max-w-[64rem] flex-col items-center space-y-4 text-center">
            <ArrowRight className="h-12 w-12 text-blue-500 animate-pulse" />
            <h2 className="font-bold text-3xl leading-[1.1] sm:text-3xl md:text-6xl bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
              开始使用
            </h2>
            <p className="max-w-[85%] leading-normal text-gray-600 sm:text-lg sm:leading-7">
              只需简单几步，即可开始使用推送服务
            </p>
          </div>

          <div className="mx-auto grid justify-center gap-6 sm:grid-cols-1 md:max-w-[64rem] md:grid-cols-3">
            {[
              {
                step: "1",
                title: "创建渠道",
                description: "选择并配置您需要的推送渠道，如钉钉机器人或企业微信应用"
              },
              {
                step: "2",
                title: "创建接口",
                description: "为渠道创建推送接口，配置消息模板"
              },
              {
                step: "3",
                title: "开始推送",
                description: "使用生成的接口URL，发送HTTP请求即可推送消息"
              }
            ].map((step, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white/50 p-6 hover:shadow-lg hover:shadow-blue-100/50 transition-all duration-300"
              >
                <div className="absolute -top-2 -left-2 bg-gradient-to-br from-blue-500 to-indigo-500 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold">
                  {step.step}
                </div>
                <div className="flex flex-col gap-4 pt-6">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-blue-100 bg-white">
        <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-4xl font-bold">Grasspush</h1>
            <p className="text-lg text-muted-foreground">
              Deploy a push notification service with Cloudflare, Drizzle and NextAuth.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
            <Heart className="h-6 w-6 text-blue-500 animate-pulse" />
            <p className="text-center text-sm text-gray-600 md:text-left">
              Built with 💕 by{" "}
              <a
                href="https://github.com/beilunyang"
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:text-blue-500 transition-colors"
              >
                BeilunYang
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
