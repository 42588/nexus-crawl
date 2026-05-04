import asyncio
import time
import json
import aiohttp
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue, manager
from core.metrics import GLOBAL_METRICS
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError, Playwright, Browser
from playwright_stealth import Stealth
import urllib.parse
from curl_cffi.requests import AsyncSession

class BrowserPool:
    def __init__(self):
        self.playwright = None
        self.browsers = {}
        self.lock = asyncio.Lock()

    async def close_all(self):
        async with self.lock:
            for browser in self.browsers.values():
                try:
                    await browser.close()
                except Exception:
                    pass
            self.browsers.clear()
            # 保持 playwright 示例，避免反复 start/stop 导致 Python 异步循环崩溃
            # do not stop self.playwright

    async def get_browser(self, browser_type="chromium", headless=True, stealth=True):
        async with self.lock:
            if not self.playwright:
                self.playwright = await async_playwright().start()
            
            key = (browser_type, headless, stealth)
            if key not in self.browsers:
                launcher = getattr(self.playwright, browser_type)
                stealth_args = [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--hide-scrollbars",
                    "--mute-audio",
                    "--no-sandbox",
                    "--disable-web-security",
                    "--disable-xss-auditor"
                ]
                self.browsers[key] = await launcher.launch(
                    headless=headless,
                    args=stealth_args if stealth else []
                )
            return self.browsers[key]

GLOBAL_BROWSER_POOL = BrowserPool()

async def execute_lightweight_http(node_config: dict, context: PipelineContext):
    url = node_config.get("url") or getattr(context, "url", None)
    
    # 动态 URL 参数模板替换 (例如 URL 里写了 https://api.ex.com/v1/user/{{user_id}})
    has_template = False
    if url and "{{" in url and "}}" in url:
        has_template = True
        for k, v in context.extracted_data.items():
            if isinstance(v, (str, int, float)):
                url = url.replace(f"{{{{{k}}}}}", urllib.parse.quote(str(v), safe='/:?&='))
        context.url = url # 更新 context 中的 URL 供下游一并使用
        
    method = node_config.get("method", "GET").upper()
    
    # === 解析节点配置的静态/动态附加参数 ===
    node_params = {}
    raw_params = node_config.get("params", "").strip()
    if raw_params:
        try:
            node_params = json.loads(raw_params)
        except Exception:
            pass

    pick_params_str = node_config.get("pickParams", "").replace("；", ";").strip()
    pick_keys = [k.strip() for k in pick_params_str.split(";") if k.strip()]
            
    # 智能参数拼接功能（子任务无缝自动接管）
    if url and not has_template:
        params = {}
        for k in pick_keys:
            if k in context.extracted_data and isinstance(context.extracted_data[k], (str, int, float, bool)):
                params[k] = context.extracted_data[k]
                
        # 附加参数只能合并不能覆盖
        for k, v in node_params.items():
            if k not in params:
                params[k] = v
        
        if params:
            if method == "GET":
                parts = list(urllib.parse.urlparse(url))
                query = dict(urllib.parse.parse_qsl(parts[4]))
                query.update({k: str(v) for k, v in params.items()})
                parts[4] = urllib.parse.urlencode(query)
                url = urllib.parse.urlunparse(parts)
                context.url = url
            elif method in ["POST", "PUT"]:
                if not node_config.get("body"):
                    node_config["body"] = json.dumps(params)
                    raw_headers = node_config.get("headers", "{}")
                    try:
                        headers_dict = json.loads(raw_headers) if raw_headers else {}
                        if not any(k.lower() == "content-type" for k in headers_dict.keys()):
                            headers_dict["Content-Type"] = "application/json"
                        node_config["headers"] = json.dumps(headers_dict)
                    except:
                        pass

    timeout_sec = node_config.get("timeout", 10)
    retries = node_config.get("retries", 0)
    # 幽灵模式配置选项：使用 curl_cffi 模拟特定浏览器的 TLS
    # Prefer dynamically generated impersonate target if available from upstream Fingerprint Randomizer
    impersonate = context.extracted_data.get("impersonate_target") or node_config.get("impersonate", "chrome120")
    
    raw_headers = node_config.get("headers", "{}")
    try:
        headers = json.loads(raw_headers) if raw_headers else {}
    except:
        headers = {}

    # === [新增这 2 行代码] 接管上游（如沙箱或特工）移交的 Cookie ===
    upstream_cookies = getattr(context, "session_cookies", {})
    if upstream_cookies:
        await log_queue.put({"type": "log", "level": "继承", "color": "\x1b[36m", "message": f"[Trace: {context.trace_id}] 已继承上游特工移交的 {len(upstream_cookies)} 个身份凭证(Cookie)！", "timestamp": datetime.now(timezone.utc).isoformat()})

    if not url:
        await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": "严重错误: 未提供目标 URL", "timestamp": datetime.now(timezone.utc).isoformat()})
        return context
        
    context.request_meta = {
        "url": url,
        "method": method,
        "headers": headers.copy(),
        "timeout": timeout_sec,
        "impersonate": impersonate,
        "type": "http"
    }

    await log_queue.put({
        "type": "log", "level": "发包", "color": "\x1b[34m", 
        "message": f"幽灵引擎点火... {method} {url} (伪装: {impersonate}, Timeout: {timeout_sec}s)",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    attempt = 0
    while attempt <= retries:
        try:
            start_time = time.perf_counter()
            
            # 使用 curl_cffi 的 AsyncSession，传入 impersonate 实现 TLS 伪造
            async with AsyncSession(impersonate=impersonate, cookies=upstream_cookies) as session:
                proxy_kwargs = {"proxy": context.proxy} if hasattr(context, 'proxy') and context.proxy else {}
                
                response = await session.request(
                    method=method, 
                    url=url, 
                    headers=headers, 
                    timeout=timeout_sec,
                    **proxy_kwargs
                )
                
                html_content = response.text
                end_time = time.perf_counter()
                
                context.status_code = response.status_code
                context.html = html_content
                context.latency = int((end_time - start_time) * 1000)
                
                # Check for JSON content type
                content_type = response.headers.get("Content-Type", "")
                is_json = "application/json" in content_type.lower()
                if is_json:
                    try:
                        parsed_json = response.json()
                        context.extracted_data["api_response"] = parsed_json
                    except:
                        pass
                
                color = "\x1b[32m" if response.status_code < 400 else "\x1b[31m"
                if response.status_code >= 400:
                    await GLOBAL_METRICS.increment_failures(latency=context.latency, proxy=getattr(context, 'proxy', None))
                else:
                    await GLOBAL_METRICS.increment_throughput(latency=context.latency, proxy=getattr(context, 'proxy', None))
                await log_queue.put({
                    "type": "log", "level": "响应", "color": color, 
                    "message": f"{response.status_code} OK | 延迟: {context.latency}ms | 载荷: {len(html_content)} bytes | 类型: {'JSON' if is_json else 'HTML/TEXT'}",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                break
                    
        except asyncio.TimeoutError:
            attempt += 1
            await log_queue.put({"type": "log", "level": "告警", "color": "\x1b[33m", "message": f"连接超时，准备重试 ({attempt}/{retries})...", "timestamp": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            attempt += 1
            await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"网络异常: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
            await GLOBAL_METRICS.increment_failures()
            
        if attempt > retries:
            await log_queue.put({"type": "log", "level": "熔断", "color": "\x1b[1;31m", "message": "已达到最大重试次数，节点执行失败", "timestamp": datetime.now(timezone.utc).isoformat()})
            context.html = ""
            break

    return context

async def _perform_auto_scroll(page, max_scrolls: int, interval_ms: int, trace_id: str):
    """
    仿生平滑滚动引擎
    """
    await log_queue.put({
        "type": "log", "level": "沙箱", "color": "\x1b[36m",
        "message": f"[{trace_id}] 激活瀑布流滚动引擎，最大滚动轮数: {max_scrolls}...",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    current_scroll = 0
    last_height = await page.evaluate("document.body.scrollHeight")

    while current_scroll < max_scrolls:
        # 1. 执行平滑滚动到底部的指令
        await page.evaluate("""
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        """)
        
        # 2. 战术停顿：等待网络请求和 DOM 渲染（加入一点随机性更像人）
        import random
        jitter = random.uniform(0.8, 1.2)
        await asyncio.sleep((interval_ms / 1000.0) * jitter)

        # 3. 校验是否到底
        new_height = await page.evaluate("document.body.scrollHeight")
        if new_height == last_height:
            # 尝试做一次微小的回滚再下滚，防止卡在某个边界条件
            await page.evaluate("window.scrollBy(0, -200);")
            await asyncio.sleep(0.5)
            await page.evaluate("window.scrollBy(0, 500);")
            await asyncio.sleep(1.0)
            
            final_height = await page.evaluate("document.body.scrollHeight")
            if final_height == last_height:
                await log_queue.put({
                    "type": "log", "level": "沙箱", "color": "\x1b[32m",
                    "message": f"[{trace_id}] 页面已触底，停止滚动。共执行 {current_scroll} 轮。",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                break
        
        last_height = new_height
        current_scroll += 1
        
        # 打印进度日志
        if current_scroll % 2 == 0:
            await log_queue.put({
                "type": "log", "level": "沙箱", "color": "\x1b[34m",
                "message": f"[{trace_id}] 正在滚动加载数据... (第 {current_scroll}/{max_scrolls} 轮，当前高度: {last_height}px)",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

    return current_scroll

# =================================================================
# 核心组件：多维智能成功探测器 (替代原有生硬的 wait_for_selector)
# =================================================================
async def wait_for_login_success(page, browser_context, timeout=120000, explicit_selector=""):
    """
    如果用户填了 explicit_selector，则尊重用户（硬规则）；
    如果留空，则启动【多维智能探针】（URL + Cookie + 语义词探测）。
    """
    start_time = time.time()
    initial_url = page.url.split('?')[0] # 记录初始 URL 去除参数
    
    # 常见的高权重鉴权 Cookie 键名特征
    auth_cookie_keywords = ["session", "token", "auth", "sessdata", "sid", "jwt", "ticket", "passport"]
    
    while time.time() - start_time < (timeout / 1000.0):
        # -----------------------------------------------------------
        # 探测通道 1：显式 DOM 探针 (如果用户配置了的话)
        # -----------------------------------------------------------
        if explicit_selector:
            try:
                if await page.locator(explicit_selector).count() > 0:
                    return "DOM_SELECTOR_MATCH"
            except: pass

        # -----------------------------------------------------------
        # 探测通道 2：URL 跃迁探针
        # -----------------------------------------------------------
        current_url = page.url
        current_url_base = current_url.split('?')[0]
        # 如果 URL 发生了跳变，并且离开了登录相关的页面
        if current_url_base != initial_url and "login" not in current_url.lower() and "signin" not in current_url.lower():
            # 为防止中间跳转页，等待网络稍微稳定
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
            return "URL_REDIRECT_MATCH"

        # -----------------------------------------------------------
        # 探测通道 3：启发式语义探针 (极速无感扫描)
        # -----------------------------------------------------------
        try:
            # 扫描页面中是否出现了登录后专属的通用词汇
            heuristic_script = """
            () => {
                const keywords = ['退出登录', '注销', '个人中心', '创作中心', '消息中心', '我的订单', '账号设置', 'Log out', 'Sign out'];
                const bodyText = document.body.innerText;
                for (let word of keywords) {
                    if (bodyText.includes(word)) return true;
                }
                return false;
            }
            """
            is_logged_in_text_found = await page.evaluate(heuristic_script)
            if is_logged_in_text_found:
                return "SEMANTIC_TEXT_MATCH"
        except: pass

        # -----------------------------------------------------------
        # 探测通道 4：凭证熵增探针 (Cookie 嗅探)
        # -----------------------------------------------------------
        try:
            current_cookies = await browser_context.cookies()
            auth_cookies_found = [c['name'] for c in current_cookies if any(k in c['name'].lower() for k in auth_cookie_keywords)]
            # 如果突然多出了 2 个以上的关键 auth cookie，基本可以断定拿到权限了
            if len(auth_cookies_found) >= 2:
                # 依然需要等页面把其余 Cookie 种完
                await asyncio.sleep(2) 
                return f"COOKIE_ENTROPY_MATCH ({','.join(auth_cookies_found[:2])})"
        except: pass

        # 探测间隔，防止 CPU 满载
        await asyncio.sleep(1.5)
        
    raise PlaywrightTimeoutError("登录智能探测器超时：未侦测到任何成功态的跃迁。")

async def execute_headless_browser(node_config: dict, context: PipelineContext):
    # Support overriding URL in config (and dynamic template rendering) or falling back to context
    url = node_config.get("url") or getattr(context, "url", "https://nowsecure.nl")
    
    has_template = False
    if url and "{{" in url and "}}" in url:
        has_template = True
        for k, v in context.extracted_data.items():
            if isinstance(v, (str, int, float)):
                url = url.replace(f"{{{{{k}}}}}", urllib.parse.quote(str(v), safe='/:?&='))
        context.url = url
        
    # === 解析节点自身配置的附加参数 ===
    node_params = {}
    raw_params = node_config.get("params", "").strip()
    if raw_params:
        try:
            node_params = json.loads(raw_params)
        except Exception:
            pass

    pick_params_str = node_config.get("pickParams", "").replace("；", ";").strip()
    pick_keys = [k.strip() for k in pick_params_str.split(";") if k.strip()]
            
    # 智能参数拼接功能（子任务无缝自动接管参数到 query string）
    if url and not has_template:
        params = {}
        for k in pick_keys:
            if k in context.extracted_data and isinstance(context.extracted_data[k], (str, int, float, bool)):
                params[k] = context.extracted_data[k]
                
        # 附加参数只能合并不能覆盖
        for k, v in node_params.items():
            if k not in params:
                params[k] = v
                
        if params:
            parts = list(urllib.parse.urlparse(url))
            query = dict(urllib.parse.parse_qsl(parts[4]))
            query.update({k: str(v) for k, v in params.items()})
            parts[4] = urllib.parse.urlencode(query)
            url = urllib.parse.urlunparse(parts)
            context.url = url
        
    browser_type = node_config.get("browserType", "chromium")
    # Read from config; default to True if unconfigured or explicitly set to True
    headless_val = node_config.get("headless", True)
    if isinstance(headless_val, str):
        headless = headless_val.lower() not in ["false", "0", "no"]
    else:
        headless = bool(headless_val)

    # =================================================================
    # [新增] 登录挂载模块配置解析
    # =================================================================
    enable_login = node_config.get("enableLogin", False)
    login_method = node_config.get("loginMethod", "semi_auto") # 'semi_auto' 或 'ai_agent'
    login_success_selector = node_config.get("loginSuccessSelector", ".avatar") # 默认探针
    
    # 🚨 战术覆写：人工半自动模式必须强行打开显示器
    if enable_login and login_method == "semi_auto":
        headless = False
        await log_queue.put({
            "type": "log", "level": "沙箱", "color": "\x1b[33m", 
            "message": f"[Trace: {context.trace_id}] 侦测到 [半自动扫码] 任务，强行越权开启沙箱可视化界面 (Headless=False)。", 
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    # =================================================================
    
    # AI Studio / Linux containers without X11 need headless=True
    import os
    if os.name != "nt" and not os.environ.get("DISPLAY") and not headless:
        headless = True
        await log_queue.put({"type": "log", "level": "告警", "color": "\x1b[33m", "message": f"[{context.trace_id}] 检测到无显示器系统，强制回退到 Headless 模式。", "timestamp": datetime.now(timezone.utc).isoformat()})
    
    use_stealth = node_config.get("stealthMode", True)
    wait_selector = node_config.get("waitForSelector", "")
    timeout_ms = node_config.get("timeout", 30) * 1000
    retries = node_config.get("retries", 0)

    await log_queue.put({
        "type": "log", "level": "沙箱", "color": "\x1b[35m", 
        "message": f"[{context.trace_id}] 正在拉起 {browser_type} 隔离环境 (Headless: {headless}, Stealth: {use_stealth}, Retries: {retries})", "timestamp": datetime.now(timezone.utc).isoformat()
    })

    attempt = 0
    while attempt <= retries:
        browser_context = None
        try:
            start_time = time.perf_counter()
            browser = await GLOBAL_BROWSER_POOL.get_browser(browser_type, headless, use_stealth)
            
            context_args = {
                "viewport": {"width": 1920, "height": 1080},
                "user_agent": context.headers.get("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
                "extra_http_headers": {k: v for k, v in context.headers.items() if k.lower() != "user-agent"}
            }
            
            if hasattr(context, 'proxy') and context.proxy:
                context_args["proxy"] = {"server": context.proxy}

            browser_context = await browser.new_context(**context_args)
            page = await browser_context.new_page()

            allow_images = node_config.get("allowImages", False)

            # 资源拦截策略 (图片, CSS, 广告脚本等) 以减轻 50% 以上的延迟
            async def route_intercept(route):
                if route.request.resource_type in ["media", "font", "stylesheet"]:
                    await route.abort()
                elif route.request.resource_type == "image" and not allow_images:
                    await route.abort()
                elif "google-analytics" in route.request.url or "doubleclick" in route.request.url:
                    await route.abort()
                else:
                    await route.continue_()
                    
            await page.route("**/*", route_intercept)

            if use_stealth:
                await Stealth().apply_stealth_async(page)
                if attempt == 0:
                    await log_queue.put({
                        "type": "log", "level": "伪装", "color": "\x1b[35m", 
                        "message": f"[{context.trace_id}] 底层指纹 (Webdriver, Chrome, Permissions) 已擦除并重塑。", "timestamp": datetime.now(timezone.utc).isoformat()
                    })

            await log_queue.put({
                "type": "log", "level": "潜入", "color": "\x1b[34m", 
                "message": f"[{context.trace_id}] 正在导航至目标: {url} (Attempt {attempt+1})", "timestamp": datetime.now(timezone.utc).isoformat()
            })

            response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            
            # =================================================================
            # [新增] 双轨登录破壁引擎
            # =================================================================
            if enable_login:
                if login_method == "semi_auto":
                    await log_queue.put({
                        "type": "log", "level": "挂起", "color": "\x1b[1;35m", 
                        "message": f"[Trace: {context.trace_id}] ⏳ 沙箱已时空挂起！请在弹出的浏览器中进行【人工扫码/手机接码】... (最大等待 2 分钟)", 
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                    try:
                        match_reason = await wait_for_login_success(page, browser_context, timeout=120000, explicit_selector=login_success_selector)
                        await log_queue.put({
                            "type": "log", "level": "成功", "color": "\x1b[1;32m", 
                            "message": f"[Trace: {context.trace_id}] 🎉 捕获到登录成功态！触发引擎: [{match_reason}]", 
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
                    except PlaywrightTimeoutError:
                        raise Exception("指挥官响应超时：2 分钟内未能突破登录壁垒。")

                elif login_method == "ai_agent":
                    await log_queue.put({
                        "type": "log", "level": "特工", "color": "\x1b[36m", 
                        "message": f"[Trace: {context.trace_id}] 🤖 AI 具身特工接管键鼠，开始执行自动化静默填表...", 
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                    
                    import random
                    username = node_config.get("username", "")
                    password = node_config.get("password", "")
                    
                    # 1. 启发式暴力填表
                    try:
                        # 广度匹配常见账号框
                        await page.locator("input[type='text'], input[name*='user'], input[id*='user'], input[placeholder*='账号'], input[placeholder*='手机']").first.fill(username)
                        await asyncio.sleep(random.uniform(0.3, 0.8))
                        # 广度匹配常见密码框
                        await page.locator("input[type='password']").first.fill(password)
                        await asyncio.sleep(random.uniform(0.3, 0.8))
                        # 点击提交
                        await page.locator("button[type='submit'], button:has-text('登录'), .login-btn, .submit").first.click()
                    except Exception as e:
                        await log_queue.put({"type": "log", "level": "警告", "message": f"表单结构异常，AI盲填失手: {e}"})

                    # 2. 风控阻击探测与视觉反杀
                    try:
                        # 等待 3.5 秒，看目标是不是弹了极验、易盾、或普通滑块
                        await page.wait_for_selector(".geetest_wrap, .yidun_wrap, .captcha-box, .nc-container, [id*='captcha']", state="visible", timeout=3500)
                        await log_queue.put({"type": "log", "level": "遇敌", "color": "\x1b[31m", "message": "遭遇风控盾牌阻击！呼叫底层视觉特工进行碎盾支援！"})
                        
                        # 💥 架构神兵：直接复用你刚刚写好的视觉对抗函数
                        from nodes.stealth import execute_vision_solver
                        vision_config = {"tactic": "slider_cv"} # 这里可以根据实际情况改为 click_ai
                        context.active_page = page
                        await execute_vision_solver(vision_config, context)
                    except PlaywrightTimeoutError:
                        pass # 没弹滑块，万事大吉
                        
                    # 3. 最终战果确认
                    try:
                        match_reason = await wait_for_login_success(page, browser_context, timeout=15000, explicit_selector=login_success_selector)
                        await log_queue.put({"type": "log", "level": "成功", "color": "\x1b[1;32m", "message": f"🤖 AI 特工全自动破壁成功！触发引擎: [{match_reason}]", "timestamp": datetime.now(timezone.utc).isoformat()})
                    except PlaywrightTimeoutError:
                        raise Exception("AI 登录战术失败：账号错误或遭遇未知的变种风控拦截。")

                # 【关键修复】：提前结算。既然是专门用来登录的，拿到 Cookie 就直接跑路入池，不要去执行后面的滚屏逻辑了
                context.html = await page.content()
                context.session_cookies = {cookie['name']: cookie['value'] for cookie in await browser_context.cookies()}
                context.status_code = response.status if response else 200
                
                await log_queue.put({
                    "type": "log", "level": "突破", "color": "\x1b[1;32m", 
                    "message": f"[{context.trace_id}] 🔐 登录挂载模块执行完毕！已提取 {len(context.session_cookies)} 个鉴权凭证准备移交池化节点。", 
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                
                await browser_context.close()
                return context
            # =================================================================
            
            if wait_selector:
                await log_queue.put({"type": "log", "level": "沙箱", "message": f"[{context.trace_id}] 等待风控脱出特征: {wait_selector}", "timestamp": datetime.now(timezone.utc).isoformat()})
                await page.wait_for_selector(wait_selector, state="attached", timeout=15000)
            else:
                try:
                    await page.wait_for_load_state("networkidle", timeout=10000)
                except:
                    pass

            human_mode = node_config.get("humanMode", True)
            if human_mode:
                import random
                await log_queue.put({"type": "log", "level": "拟真", "color": "\x1b[36m", "message": f"[{context.trace_id}] 执行人类行为拟真算法，规避行为风控...", "timestamp": datetime.now(timezone.utc).isoformat()})
                for _ in range(random.randint(2, 4)):
                    await page.mouse.move(random.randint(100, 800), random.randint(100, 800), steps=random.randint(5, 20))
                    await page.mouse.wheel(0, random.randint(100, 400))
                    await asyncio.sleep(random.uniform(0.5, 1.5))

            auto_scroll = node_config.get("autoScroll", False)
            if auto_scroll:
                max_scrolls = node_config.get("maxScrollTimes", 5)
                scroll_interval = node_config.get("scrollInterval", 1500)
                await _perform_auto_scroll(page, max_scrolls, scroll_interval, context.trace_id)

            # Update context with the fully rendered HTML and cookies
            context.html = await page.content()
            context.session_cookies = {cookie['name']: cookie['value'] for cookie in await browser_context.cookies()}
            context.status_code = response.status if response else 200
            
            end_time = time.perf_counter()
            duration_ms = int((end_time - start_time) * 1000)

            if context.status_code >= 400:
                await GLOBAL_METRICS.increment_failures(latency=duration_ms, proxy=getattr(context, 'proxy', None))
            else:
                await GLOBAL_METRICS.increment_throughput(latency=duration_ms, proxy=getattr(context, 'proxy', None))

            await log_queue.put({
                "type": "log", "level": "突破", "color": "\x1b[1;32m", 
                "message": f"[{context.trace_id}] 穿透成功！共耗时 {duration_ms}ms。提取载荷 {len(context.html)} bytes, 捕获 {len(context.session_cookies)} 个会话凭证。", "timestamp": datetime.now(timezone.utc).isoformat()
            })

            await browser_context.close()
            browser_context = None
            return context

        except PlaywrightTimeoutError:
            attempt += 1
            await GLOBAL_METRICS.increment_failures()
            await log_queue.put({"type": "log", "level": "告警", "color": "\x1b[33m", "message": f"[{context.trace_id}] 致命: 无法突破人机验证或目标超时。准备重试(已尝试 {attempt}/{retries+1} 次)...", "timestamp": datetime.now(timezone.utc).isoformat()})
        except asyncio.CancelledError:
            await log_queue.put({"type": "log", "level": "系统", "color": "\x1b[31m", "message": f"[{context.trace_id}] 进程被中止: 强制释放沙箱底层句柄", "timestamp": datetime.now(timezone.utc).isoformat()})
            raise
        except Exception as e:
            attempt += 1
            import traceback
            error_details = "".join(traceback.format_exception(type(e), e, e.__traceback__))
            await GLOBAL_METRICS.increment_failures()
            await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"[{context.trace_id}] 沙箱环境崩溃: {type(e).__name__}: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
            print("Pwright Exception:", error_details)
        finally:
            if browser_context:
                try:
                    await browser_context.close()
                except:
                    pass
            
    await log_queue.put({"type": "log", "level": "熔断", "color": "\x1b[1;31m", "message": f"[{context.trace_id}] 沙箱完全熔断！已达到最大重试上限。", "timestamp": datetime.now(timezone.utc).isoformat()})
    return None

async def execute_burst_concurrency(node_config: dict, context: PipelineContext, nodes: list, edges: list, dummy_idx: int):
    # 架构升级：获取当前节点的来源信息需要查找
    concurrency = node_config.get("maxWorkers") or node_config.get("concurrency", 10)
    
    if context.extracted_data.get("is_daemon_worker"):
        await log_queue.put({
            "type": "log", "level": "游标", "color": "\x1b[35m", 
            "message": f"[Trace: {context.trace_id}] 脉冲并发节点在 Daemon Worker 模式下作为队列通道，穿透执行...",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return [context]

    await log_queue.put({
        "type": "log", "level": "裂变", "color": "\x1b[1;35m", 
        "message": f"[Trace: {context.trace_id}] 触发狂暴级脉冲并发！当前上下文将被超维克隆 {concurrency} 份并行轰炸下游！",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # 通过返回一个 list，让新一代调度引擎自动对每一个执行动态扇出！
    clones = []
    import random
    for _ in range(concurrency):
        new_context = context.clone()
        new_context.trace_id = f"{context.trace_id}_clone_{random.randint(1000, 9999)}"
        clones.append(new_context)
        
    return clones

# 全局断点锁管理器：记录等待救援的 Worker
# { "trace_id": asyncio.Event() }
GLOBAL_BREAKPOINT_LOCKS = {}

# 全局断点数据载荷：记录前端发回的指挥官指令
# { "trace_id": {"action": "continue", "payload": "..."} }
GLOBAL_BREAKPOINT_DATA = {}

async def execute_tactical_breakpoint(node_config: dict, context: PipelineContext):
    trace_id = getattr(context, "trace_id", "unknown_trace")
    detect_mode = node_config.get("detectMode", "auto_captcha")
    strategy = node_config.get("strategy", "manual")
    
    html_content = getattr(context, "html", "")
    status_code = getattr(context, "status_code", 200)
    
    hit_suspension = False
    stop_reason = ""
    
    # ---------------- 触发条件判断 ----------------
    try:
        status_code = int(status_code)
    except:
        status_code = 502

    is_json = False
    if html_content:
        stripped = html_content.strip()
        is_json = stripped.startswith("{") or stripped.startswith("[")

    lowered_html = html_content.lower() if html_content else ""

    if detect_mode == "always":
        hit_suspension = True
        stop_reason = "强制调试断点"
    elif detect_mode == "http_error":
        if status_code >= 400:
            hit_suspension = True
            stop_reason = f"网络层阻断: HTTP {status_code}"
    elif detect_mode == "keyword":
        keyword = node_config.get("keyword", "频繁")
        if keyword and keyword in html_content:
            hit_suspension = True
            stop_reason = f"页面存在指定拦截截词: [{keyword}]"
    else: # auto_captcha
        suspicious_tags = ["geetest", "nc_1_n1z", "cf-turnstile", "captcha", "验证码", "安全校验", "verify", "人机交互", "unusual traffic"]
        for tag in suspicious_tags:
            if tag in lowered_html:
                hit_suspension = True
                stop_reason = f"风控标示命中: [{tag}]"
                break
                
        if not hit_suspension and status_code >= 400:
            hit_suspension = True
            stop_reason = f"请求遭受主动阻断 (HTTP {status_code})"
            
        if not hit_suspension and status_code == 200 and not is_json:
            if not html_content or len(html_content.strip()) < 80:
                hit_suspension = True
                stop_reason = f"隐性阻放: 页面极短或数据流被截断"
            elif "<html" in lowered_html and "<title>" not in lowered_html:
                hit_suspension = True
                stop_reason = f"隐性风控: DOM残缺或处于验证过渡页"

    if not hit_suspension:
        await log_queue.put({
            "type": "log", "level": "哨兵", "color": "\x1b[32m", 
            "message": f"[Trace: {trace_id}] 风控哨兵巡查：未见异常，目标通路顺畅，走向 [main] 分支。",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        context.route_path = "main"
        return context

    # ---------------- 触发防御回路 ----------------
    await log_queue.put({
        "type": "log", "level": "挂起", "color": "\x1b[1;31m", 
        "message": f"[Trace: {trace_id}] 🛑 哨兵拦截！缘由：{stop_reason}。走向 [evade] 分支等待破壁。",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # 为保持节点独立性，将其标记并挂载，交还由管道处理器进行调度
    context.route_path = "evade"
    context.extracted_data["evasion_reason"] = stop_reason

    # 如果有断点挂起功能，可作为单独节点实现。
    # 哨兵节点的主要功能是纯粹的识别与路由。
    
    return context

async def execute_manual_breakpoint(node_config: dict, context: PipelineContext):
    trace_id = getattr(context, "trace_id", "Unknown")
    pipeline_id = getattr(context, "pipeline_id", trace_id)
        
    # 1. 创建属于当前 Worker 的异步事件锁
    event = asyncio.Event()
    GLOBAL_BREAKPOINT_LOCKS[trace_id] = event
    
    # =====================================================================
    # 🚨 核心：智能上下文嗅探与前端防爆截断引擎
    # =====================================================================
    view_mode = "html"  # 默认渲染网页沙箱模式
    preview_data = None
    total_records = 0
    html_snapshot = getattr(context, "html", "")
    
    # 定义高优先级的数据键名 (优先展示最新的清洗/读取/抓取结果)
    data_keys_to_check = ["cleaned_data", "read_data", "api_response", "ai_parsed"]
    
    # 智能嗅探：如果上下文里有明显的结构化数据块，自动切换到 Data 视图
    for key in data_keys_to_check:
        if key in context.extracted_data and context.extracted_data[key]:
            view_mode = "data"
            raw_data = context.extracted_data[key]
            
            # 【防爆截断机制】：绝对不向前端发送全量数据，只切片前 50 条作为 Preview
            if isinstance(raw_data, list):
                total_records = len(raw_data)
                preview_data = raw_data[:50]  # 强制截断，保护 WebSocket 和浏览器
            elif isinstance(raw_data, dict):
                total_records = 1
                preview_data = raw_data # 字典通常较小，直接发送
            else:
                total_records = 1
                preview_data = str(raw_data)
            break

    # 兜底探测：如果 HTML 为空，且 extracted_data 里有零散数据，强制转为 Data 视图
    if view_mode == "html" and (not html_snapshot or len(html_snapshot.strip()) < 50):
        view_mode = "data"
        preview_data = context.extracted_data
        total_records = len(context.extracted_data.keys())
    # =====================================================================

    reason = node_config.get("suspendReason", "人工调试检查点")
    
    alert_payload = {
        "type": "breakpoint_alert",
        "trace_id": trace_id,
        "pipeline_id": getattr(context, "pipeline_id", trace_id),
        "message": reason,
        
        # 还原被删减的上下文参数，供前端按需覆写
        "url": getattr(context, "url", ""),
        "status_code": getattr(context, "status_code", None),
        "latency": getattr(context, "latency", 0),
        "proxy": getattr(context, "proxy", None),
        "headers": getattr(context, "headers", {}),
        "session_cookies": getattr(context, "session_cookies", {}),
        "extracted_data": getattr(context, "extracted_data", {}),
        
        # 智能视图指示器与安全“瘦身”后的载荷
        "view_mode": view_mode, 
        "html_snapshot": html_snapshot, # 始终发送 html_snapshot 供查看和覆盖
        "preview_data": preview_data,
        "total_records": total_records,
        "is_truncated": total_records > 50 if isinstance(total_records, int) else False,
    }
    
    from core.logger import manager
    await manager.broadcast(alert_payload)
    
    mode_text = "📊 数据检阅" if view_mode == "data" else "🌍 网页沙箱"
    await log_queue.put({
        "type": "log", "level": "挂机", "color": "\x1b[1;31m", 
        "message": f"[Trace: {trace_id}] 🛑 触发【人工断点 ({mode_text})】，检测到战利品数量: {total_records}，时空凝滞等待释放...",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # 3. 阻塞 Worker，等待 UI 传回放行指令
    await event.wait()

    # 4. 读取指挥官指令
    commander_decision = GLOBAL_BREAKPOINT_DATA.get(trace_id, {})
    action = commander_decision.get("action", "continue")
    payload = commander_decision.get("payload", "")

    if trace_id in GLOBAL_BREAKPOINT_LOCKS: del GLOBAL_BREAKPOINT_LOCKS[trace_id]
    if trace_id in GLOBAL_BREAKPOINT_DATA: del GLOBAL_BREAKPOINT_DATA[trace_id]

    await log_queue.put({
        "type": "log", "level": "恢复", "color": "\x1b[32m", 
        "message": f"[Trace: {trace_id}] ⚡ 指挥官介入完成：[{action.upper()}]，管线重新流转！",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    if action == "abort":
        return None
    elif action == "update_context":
        try:
            if isinstance(payload, dict):
                for k, v in payload.items():
                    setattr(context, k, v)
        except Exception:
            pass
    elif action == "inject_html":
        context.html = payload

    return context

async def execute_status_router(node_config: dict, context: PipelineContext):
    fail_codes_str = node_config.get("failCodes", "")
    current_status = getattr(context, "status_code", 200)
    try:
        current_status = int(current_status) if current_status is not None else 0
    except:
        current_status = 0

    # ---------------- 核心自我疗愈机制：状态驱动身份熔断 ----------------
    if current_status in [401, 403, 302]:
        uid = context.extracted_data.get("current_identity_uid")
        domain = context.extracted_data.get("current_identity_domain")
        
        if uid and domain:
            from core.identity_manager import GLOBAL_IDENTITY_POOL
            # 反向通知池子：这个账号死了，拉黑它
            await GLOBAL_IDENTITY_POOL.invalidate_identity(domain, uid, context.trace_id, f"HTTP {current_status} 风控拦截")
    # -------------------------------------------------------------------

    is_failed = False
    if fail_codes_str:
        fail_codes = [int(c.strip()) for c in fail_codes_str.split(",") if c.strip().isdigit()]
        if current_status in fail_codes:
            is_failed = True
    else:
        if current_status is None or current_status >= 400 or current_status == 0:
            is_failed = True
            
    if is_failed:
        await log_queue.put({
            "type": "log", "level": "拦截降级", "color": "\x1b[31m", 
            "message": f"[Trace: {context.trace_id}] 遭遇异常状态 {current_status}！线路降级，数据包转向【红色降级端口】...",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        context.route_path = "fallback"
        return context
    else:
        await log_queue.put({
            "type": "log", "level": "通行路由", "color": "\x1b[32m", 
            "message": f"[Trace: {context.trace_id}] 状态 {current_status} 正常，请求放行！沿着主干线【绿色通行端口】流转...",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        context.route_path = "success" 
        return context
