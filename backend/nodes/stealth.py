import asyncio
import random
import aiohttp
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue

GLOBAL_PROXY_STATE = {"proxy": None, "last_fetch": 0}

async def execute_proxy_pool(node_config: dict, context: PipelineContext):
    smart_input = node_config.get("smartProxyInput", "").strip()
    strategy_mode = node_config.get("strategyMode", "sequence")
    proxy_chosen = None
    
    if strategy_mode == "global" and GLOBAL_PROXY_STATE["proxy"]:
        proxy_chosen = GLOBAL_PROXY_STATE["proxy"]

    if not proxy_chosen and smart_input:
        lines = [line.strip() for line in smart_input.split('\n') if line.strip()]
        if lines:
            if lines[0].startswith("http://") or lines[0].startswith("https://"):
                api_url = lines[0]
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(api_url, timeout=5) as resp:
                            if resp.status == 200:
                                data = await resp.text()
                                proxies = [p.strip() for p in data.split() if ":" in p]
                                if proxies:
                                    proxy_chosen = random.choice(proxies)
                except Exception as e:
                    await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 代理 API 请求失败: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
            else:
                proxies = lines
                proxy_chosen = random.choice(proxies)

        if proxy_chosen:
            if not proxy_chosen.startswith("http") and not proxy_chosen.startswith("socks"):
                 proxy_chosen = f"http://{proxy_chosen}"
                 
            if strategy_mode == "global":
                GLOBAL_PROXY_STATE["proxy"] = proxy_chosen

    if proxy_chosen:
        context.proxy = proxy_chosen
        
        await log_queue.put({
            "type": "log", "level": "调度", "color": "\x1b[35m", 
            "message": f"[Trace: {context.trace_id}] 已挂载战术代理: {proxy_chosen}，开启网络隐身。",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    else:
        await log_queue.put({
            "type": "log", "level": "警告", "color": "\x1b[33m", 
            "message": f"[Trace: {context.trace_id}] 代理池为空或解析失败，将直连发起无护盾请求！",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    return context

GLOBAL_HEADER_STATE = {"headers": None}

async def execute_fingerprint_spoof(node_config: dict, context: PipelineContext):
    strategy = node_config.get("strategy", "browser_matched")
    strategy_mode = node_config.get("strategyMode", "sequence")
    ja3_spoof = node_config.get("ja3Spoof", True)
    
    await log_queue.put({"type": "log", "level": "风控", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 执行网络指纹变异策略 [{strategy}] ({'共享全局' if strategy_mode == 'global' else '独立序列'})，重组 Headers 与设备特征...", "timestamp": datetime.now(timezone.utc).isoformat()})
    if ja3_spoof:
        await asyncio.sleep(0.3)
        await log_queue.put({"type": "log", "level": "隐匿", "color": "\x1b[1;35m", "message": f"[Trace: {context.trace_id}] 启用底图 TLS/JA3 握手包伪造，以规避 WAF 或 Cloudflare 探针！", "timestamp": datetime.now(timezone.utc).isoformat()})
    
    headers_chosen = None
    impersonate_target = None
    if strategy_mode == "global" and GLOBAL_HEADER_STATE["headers"]:
        headers_chosen = GLOBAL_HEADER_STATE["headers"]
        impersonate_target = GLOBAL_HEADER_STATE.get("impersonate_target", "chrome120")
        
    if not headers_chosen:
        desktop_profiles = [
            {"os": "Windows NT 10.0; Win64; x64", "platform": '"Windows"', "versions": ["120", "121", "122", "123", "124", "125", "126", "127"], "mobile": "?0"},
            {"os": "Macintosh; Intel Mac OS X 10_15_7", "platform": '"macOS"', "versions": ["120", "121", "122", "123", "124", "125", "126", "127", "128"], "mobile": "?0"},
            {"os": "X11; Linux x86_64", "platform": '"Linux"', "versions": ["120", "121", "122", "123", "124", "125"], "mobile": "?0"}
        ]
        
        mobile_profiles = [
            {"os": "Linux; Android 14; SM-S918B", "platform": '"Android"', "versions": ["120", "121", "122", "123", "124", "125", "126"], "mobile": "?1"},
            {"os": "Linux; Android 13; Pixel 7 Pro", "platform": '"Android"', "versions": ["120", "121", "122", "123", "124", "125"], "mobile": "?1"},
            {"os": "Linux; Android 12; M2101K6G", "platform": '"Android"', "versions": ["120", "121", "122", "123"], "mobile": "?1"}
        ]
        
        import random
        if strategy == "mobile_only":
            pool = mobile_profiles
        elif strategy == "random":
            pool = desktop_profiles + mobile_profiles
        else: # browser_matched (default to desktop heavily, or random mix)
            pool = desktop_profiles * 3 + mobile_profiles

        profile = random.choice(pool)
        v = random.choice(profile["versions"])
        
        # Smartly construct Sec-Ch-Ua
        brands = [
            f'"Not/A)Brand";v="8", "Chromium";v="{v}", "Google Chrome";v="{v}"',
            f'"Chromium";v="{v}", "Google Chrome";v="{v}", "Not-A.Brand";v="99"',
            f'"Google Chrome";v="{v}", "Chromium";v="{v}", "Not.A/Brand";v="24"'
        ]
        ch_ua = random.choice(brands)
            
        headers_chosen = {
            "User-Agent": f"Mozilla/5.0 ({profile['os']}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            "Sec-Ch-Ua": ch_ua,
            "Sec-Ch-Ua-Mobile": profile["mobile"],
            "Sec-Ch-Ua-Platform": profile["platform"],
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1"
        }
        
        # Provide sensible curl_cffi impersonate target
        # For mobile, we might fallback to chrome<ver> since mobile impersonates are less common out of the box,
        # but realistically, curl_cffi supports some chrome target. We'll map to 'chrome120' if missing version.
        try:
            impersonate_target = f"chrome{v}"
        except:
            impersonate_target = "chrome120"
        
        if strategy_mode == "global":
            GLOBAL_HEADER_STATE["headers"] = headers_chosen
            GLOBAL_HEADER_STATE["impersonate_target"] = impersonate_target

    context.headers.update(headers_chosen)
    context.extracted_data["impersonate_target"] = impersonate_target
    return context

from core.identity_manager import GLOBAL_IDENTITY_POOL

async def execute_session_pool(node_config: dict, context: PipelineContext):
    pool_mode = node_config.get("poolMode", "extract")
    target_domain = node_config.get("domain", "default_domain")
    
    if pool_mode == "inject":
        if not getattr(context, "session_cookies", {}):
            await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] 当前上下文中未嗅探到有效 Cookies，无法注入身份池。", "timestamp": datetime.now(timezone.utc).isoformat()})
            return context
        identity_data = {
            "cookies": context.session_cookies,
            "headers": getattr(context, "headers", {}),
            "status": "active"
        }
        await GLOBAL_IDENTITY_POOL.inject_identity(target_domain, identity_data, context.trace_id)
        
    elif pool_mode == "extract":
        identity = await GLOBAL_IDENTITY_POOL.extract_identity(target_domain, context.trace_id)
        if identity:
            context.session_cookies = identity.get("cookies", {})
            # 记录当前领到的工牌，供下游死号时上报
            context.extracted_data["current_identity_uid"] = identity.get("uid")
            context.extracted_data["current_identity_domain"] = target_domain
        else:
            await log_queue.put({"type": "log", "level": "熔断", "color": "\x1b[1;31m", "message": f"[Trace: {context.trace_id}] 身份池 [{target_domain}] 枯竭无可用身份！阻断并挂起执行流程。", "timestamp": datetime.now(timezone.utc).isoformat()})
            context.route_path = "fallback"
            
    return context

import os
import base64
import json
import numpy as np
import cv2
from playwright.async_api import async_playwright
from google import genai
from google.genai import types

# --- 核心算法 1：仿生鼠标轨迹生成器 (防止被检测出直线移动) ---
def generate_human_trajectory(distance):
    """
    生成一段先快后慢、偶尔抖动、甚至会略微超过再退回来的贝塞尔仿生轨迹
    """
    track = []
    current = 0
    mid = distance * 4 / 5  # 前 4/5 距离加速
    t = 0.2
    v = 0
    while current < distance:
        if current < mid:
            a = random.uniform(2, 5) # 加速
        else:
            a = -random.uniform(3, 5) # 减速缓冲
        v0 = v
        v = v0 + a * t
        move = v0 * t + 1 / 2 * a * t * t
        current += move
        track.append(round(current))
    
    # 模拟手抖：加上一点点回退然后修正的动作
    if track:
        track.extend([track[-1] + 2, track[-1] - 1, track[-1] + 1])
    return track

# --- 核心算法 2：OpenCV 滑块缺口计算 ---
def solve_slider_captcha_cv(bg_bytes, slider_bytes):
    # 将二进制图片转为 numpy 数组
    bg_array = np.frombuffer(bg_bytes, np.uint8)
    slider_array = np.frombuffer(slider_bytes, np.uint8)
    
    bg_img = cv2.imdecode(bg_array, cv2.IMREAD_COLOR)
    slider_img = cv2.imdecode(slider_array, cv2.IMREAD_COLOR)
    
    # 转换为灰度图
    bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
    slider_gray = cv2.cvtColor(slider_img, cv2.COLOR_BGR2GRAY)
    
    # 使用 Canny 算子提取边缘特征 (大幅抵抗背景干扰)
    bg_edge = cv2.Canny(bg_gray, 100, 200)
    slider_edge = cv2.Canny(slider_gray, 100, 200)
    
    # 模板匹配寻找缺口
    result = cv2.matchTemplate(bg_edge, slider_edge, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
    
    # max_loc[0] 就是我们要滑动的 X 轴距离
    return max_loc[0]

# --- 算子主函数 ---
async def execute_vision_solver(node_config: dict, context):
    tactic = node_config.get("tactic", "slider_cv")
    url = getattr(context, "url", "https://example.com/captcha_page")
    
    await log_queue.put({
        "type": "log", "level": "破壁", "color": "\x1b[31m",
        "message": f"[Trace: {context.trace_id}] 视觉刺客已空降！采用战术: {'CV 滑块计算' if tactic == 'slider_cv' else 'LLM 视觉点选'}"
    })

    # 👇 [修改这里]：判断是否是沙箱内部调用的“嵌套特工”
    page = getattr(context, "active_page", None)
    is_nested_call = page is not None
    browser_context = None
    
    try:
        # 如果不是嵌套调用（作为独立节点运行），才需要自己开浏览器
        if not is_nested_call:
            from nodes.action import GLOBAL_BROWSER_POOL
            browser = await GLOBAL_BROWSER_POOL.get_browser("chromium", headless=True, stealth=True)
            context_args = {
                "viewport": {"width": 1280, "height": 720},
                "user_agent": context.headers.get("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
                "extra_http_headers": {k: v for k, v in context.headers.items() if k.lower() != "user-agent"}
            }
            if hasattr(context, 'proxy') and context.proxy:
                 context_args["proxy"] = {"server": context.proxy}
                 
            browser_context = await browser.new_context(**context_args)
            if hasattr(context, "session_cookies") and context.session_cookies:
                await browser_context.add_cookies([
                    {"name": k, "value": v, "url": url} for k, v in context.session_cookies.items()
                ])
                
            page = await browser_context.new_page()
            
            async def route_intercept(route):
                if route.request.resource_type in ["media"]: # 只阻断音视频
                    await route.abort()
                else:
                    await route.continue_()
                    
            await page.route("**/*", route_intercept)
            
            await page.goto(url, wait_until="networkidle")
        
        # ---------------------------------------------------------
        # 战术 A：OpenCV 仿生滑块对抗
        # ---------------------------------------------------------
        if tactic == "slider_cv":
            await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 请求空投 AI 隐匿具身雷达，执行页面扫描以确定背景图与滑块容器位置..."})
            
            prompt_cv = """
            分析以上 DOM 可交互元素列表，请找出属于“滑块验证码”的部分。
            请返回 JSON：{"bg_id": "背景图所在的大框元素的 data-arachne-id", "slider_id": "要拖动的那块拼图或滑块的 data-arachne-id"}
            """
            interactive_nodes = await page.evaluate(MARK_INTERACTIVE_ELEMENTS_JS)
            
            from core.llm import call_vision_llm
            try:
                 resp_text, _ = await call_vision_llm(context.agent_model, "分析交互节点", f"{prompt_cv}\n\n当前节点列表: {json.dumps(interactive_nodes[:50], ensure_ascii=False)}", b"", json_mode=True)
                 ids = json.loads(resp_text.replace('```json', '').replace('```', '').strip())
                 bg_sel = f"[data-arachne-id='{ids.get('bg_id')}']" if ids.get('bg_id') else ""
                 slider_sel = f"[data-arachne-id='{ids.get('slider_id')}']" if ids.get('slider_id') else ""
            except Exception:
                 bg_sel, slider_sel = "", ""

            if not bg_sel or not slider_sel:
                await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 特工雷达未清晰锁定目标，融合无监督 DOM 启发式探测模式兜底..."})
                guess_script = """
                () => {
                    const bgClasses = ['geetest_canvas_bg', 'yidun_bg-img', 'nc-bg', 'sliding-captcha-bg', 'captcha-bg'];
                    const sliderClasses = ['geetest_canvas_slice', 'yidun_slider', 'nc_iconfont', 'sliding-captcha-slider', 'slider-btn'];
                    
                    let bg = null, slider = null;
                    
                    for (const c of bgClasses) {
                        const el = document.querySelector(`.${c}, [class*="${c}"]`);
                        if (el) { bg = el; break; }
                    }
                    for (const c of sliderClasses) {
                        const el = document.querySelector(`.${c}, [class*="${c}"]`);
                        if (el) { slider = el; break; }
                    }
                    
                    if (!bg || !slider) {
                        const canvases = Array.from(document.querySelectorAll('canvas'));
                        if (canvases.length >= 2) {
                            canvases.sort((a,b) => (b.width * b.height) - (a.width * a.height));
                            // the largest canvas is typically the background, second largest is the slice/slider
                            bg = canvases[0];
                            slider = canvases[1];
                        }
                    }
                    
                    if (bg && slider) {
                        bg.classList.add('arachne-detected-bg');
                        slider.classList.add('arachne-detected-slider');
                        return { bg: '.arachne-detected-bg', slider: '.arachne-detected-slider' };
                    }
                    return null;
                }
                """
                res = await page.evaluate(guess_script)
                if res and res.get("bg") and res.get("slider"):
                    bg_sel = res["bg"]
                    slider_sel = res["slider"]
                    await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[1;32m", "message": f"[Trace: {context.trace_id}] 启发式探测成功！已自动锁定动态滑块及背景画布。"})
                else:
                    await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] 启发式探测未能命中常见滑块特征，默认降级使用常规探测模式。"})
                    bg_sel = ".bg-img"
                    slider_sel = ".slider-img"

            await page.wait_for_selector(bg_sel, timeout=10000)
            
            # 截取背景图和滑块图
            bg_box = await page.locator(bg_sel).bounding_box()
            slider_box = await page.locator(slider_sel).bounding_box()
            
            bg_bytes = await page.locator(bg_sel).screenshot()
            slider_bytes = await page.locator(slider_sel).screenshot()
            
            # 计算缺口像素偏移量
            x_offset = solve_slider_captcha_cv(bg_bytes, slider_bytes)
            await log_queue.put({"type": "log", "level": "CV", "color": "\x1b[36m", "message": f"[Trace: {context.trace_id}] OpenCV 锁定目标缺口，X轴偏移量: {x_offset}px"})
            
            # 规划仿生轨迹
            track = generate_human_trajectory(x_offset)
            
            # 模拟鼠标物理拖拽
            await page.mouse.move(slider_box["x"] + 10, slider_box["y"] + 10)
            await page.mouse.down()
            
            current_x = slider_box["x"] + 10
            for move_x in track:
                # 模拟 Y 轴的人类微小手抖 (-2 到 2 像素)
                y_shake = slider_box["y"] + 10 + random.randint(-2, 2)
                await page.mouse.move(current_x + move_x, y_shake)
                await asyncio.sleep(random.uniform(0.01, 0.03)) # 不规则间隔
            
            await page.mouse.up()
            await log_queue.put({"type": "log", "level": "破壁", "color": "\x1b[32m", "message": f"[Trace: {context.trace_id}] 仿生拖拽完成，盾牌已被击碎！"})

        # ---------------------------------------------------------
        # 战术 B：Gemini 1.5 Pro 多模态红绿灯/找茬对抗
        # ---------------------------------------------------------
        elif tactic == "click_ai":
            await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 启动多模态直攻战术..."})
            
            model_name = getattr(context, "agent_model", "gemini-2.5-flash")
            api_key = os.environ.get("GEMINI_API_KEY")
            dashscope_key = os.environ.get("DASHSCOPE_API_KEY")
            
            await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 请求空投 AI 隐匿具身雷达，执行页面扫描以确定包含多个验证目标的区域大框..."})
            
            prompt_cv = """
            分析以上 DOM 可交互元素列表，请找出属于“多图验证码/点选验证码/红绿灯/字序点击/滑块验证码”的外层大框容器部分。
            请严格返回 JSON：{"captcha_box_id": "验证码外层大框的 data-arachne-id"}
            """
            
            # 找到大框后截图
            
            # 使用多模态分析提取坐标点
            sys_prompt = """
            这是一张网页验证码的截图。
            请你自己阅读截图中包含的验证提示语（例如“请点击所有的红绿灯”、“请依次点击‘我’‘爱’‘你’”等），并理解该验证码的解题目标。
            请仔细分析图像，从左到右或按提示要求的顺序，找出所有需要点击或操作的目标，并返回它们的中心点绝对坐标相较于该截图宽高的百分比位置（归一化为 0.0 到 1.0 之间的小数）。
            只返回你需要点击的那几个点，不要多返回无关的点。
            必须严格且仅返回合法的 JSON 格式的坐标数组，不要有任何 Markdown 修饰（不要以```json开头），例如 [{"x": 0.2, "y": 0.5}, {"x": 0.8, "y": 0.1}]。如果找不到任何目标，返回 []。
            """

            target_prompt = "请帮我解出此验证码的点击位置。"
            
            try:
                 resp_text, _ = await call_vision_llm(context.agent_model, "分析交互节点寻找验证码外框", f"{prompt_cv}\n\n当前节点列表: {json.dumps(interactive_nodes[:50], ensure_ascii=False)}", b"", json_mode=True)
                 ids = json.loads(resp_text.replace('```json', '').replace('```', '').strip())
                 captcha_sel = f"[data-arachne-id='{ids.get('captcha_box_id')}']" if ids.get('captcha_box_id') else ""
            except Exception:
                 captcha_sel = ""
            
            if not captcha_sel:
                await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 导航特工未能精准识别点选框主体，启用后备无监督探索方案..."})
                guess_script = """
                () => {
                    const boxClasses = ['geetest_wrap', 'yidun_wrap', 'nc-container', 'captcha-container', 'g-recaptcha', 'h-captcha'];
                    for (const c of boxClasses) {
                        const el = document.querySelector(`.${c}, [class*="${c}"]`, `[id*="captcha"]`);
                        if (el) {
                            el.classList.add('arachne-detected-captcha');
                            return '.arachne-detected-captcha';
                        }
                    }
                    return null;
                }
                """
                res = await page.evaluate(guess_script)
                if res:
                    captcha_sel = res
                    await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[1;32m", "message": f"[Trace: {context.trace_id}] 启发式探测成功！已自动锁定验证码容器。"})
                else:
                    await log_queue.put({"type": "log", "level": "探测", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] 未发现标准的验证码 DOM 特征，将强行对全屏 (body) 进行特工降维打击。"})
                    captcha_sel = "body"


            
            await page.wait_for_selector(captcha_sel, timeout=10000)
            box = await page.locator(captcha_sel).bounding_box()
            
            # 仅截取验证码区域
            screenshot_bytes = await page.locator(captcha_sel).screenshot()
            
            await log_queue.put({"type": "log", "level": "AI", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 正在将视觉画面传送至 {model_name} 寻的..."})
            
            sys_prompt = """
这是一张网页验证码的截图。
请你自己阅读截图中包含的验证提示语（例如“请点击所有的红绿灯”、“请依次点击‘我’‘爱’‘你’”等），并理解该验证码的解题目标。
注意：你需要从截图中提取验证码的问题！
请仔细分析图像，从左到右或按提示要求的顺序，找出所有需要点击或操作的目标，并返回它们的中心点相对该截图宽高的坐标百分比位置（归一化为 0.0 到 1.0 之间小数）。
只返回你需要点击的那几个点，不要多返回无关的点。
必须严格且仅返回合法的 JSON 格式的坐标数组，不要有任何 Markdown 修饰（不要以```json开头），例如 [{"x": 0.2, "y": 0.5}, {"x": 0.8, "y": 0.1}]。如果找不到任何目标，返回 []。
"""
            
            clean_json = "[]"
            from core.llm import call_vision_llm
            try:
                resp_text, tokens = await call_vision_llm(model_name, sys_prompt, target_prompt, screenshot_bytes, json_mode=True)
                clean_json = resp_text.replace('```json', '').replace('```', '').strip()
                context.llm_tokens += tokens
            except Exception as e:
                await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"视觉多模态 API 调用失败: {str(e)}"})

            try:
                points = json.loads(clean_json)
            except Exception as e:
                await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] AI JSON 解析失败: {e}"})
                points = []
            
            await log_queue.put({"type": "log", "level": "AI", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] {model_name} 锁定 {len(points)} 个目标坐标！执行火力打击..."})
            
            # 映射回绝对坐标并执行点击
            for pt in points:
                abs_x = box["x"] + pt["x"] * box["width"]
                abs_y = box["y"] + pt["y"] * box["height"]
                await page.mouse.move(abs_x, abs_y)
                await asyncio.sleep(0.1) # 停顿瞄准
                await page.mouse.click(abs_x, abs_y)
                await asyncio.sleep(random.uniform(0.3, 0.7)) # 两次点击间隔
                
            await log_queue.put({"type": "log", "level": "破壁", "color": "\x1b[32m", "message": f"[Trace: {context.trace_id}] 验证码点选完成！"})

        # 等待破壁后的页面重定向或加载
        try:
            await page.wait_for_load_state("networkidle", timeout=5000)
        except:
            pass

        if not is_nested_call:
            # 窃取胜利果实：将破壁后成功获取的通行证（Cookie）移交回主干
            context.html = await page.content()
            raw_cookies = await browser_context.cookies()
            cookies_dict = {c['name']: c['value'] for c in raw_cookies}
            context.session_cookies = cookies_dict
            
            await browser_context.close()
            browser_context = None
            
        return context

    except asyncio.CancelledError:
        await log_queue.put({"type": "log", "level": "系统", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 防护穿透任务中止: 释放幽灵沙箱", "timestamp": datetime.now(timezone.utc).isoformat()})
        raise
    except Exception as e:
         await log_queue.put({"type": "log", "level": "阵亡", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 破壁行动失败: {str(e)}"})
         return None
    finally:
         if browser_context:
             try:
                 await browser_context.close()
             except:
                 pass

MARK_INTERACTIVE_ELEMENTS_JS = """
() => {
    let elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
    let interactiveNodes = [];
    elements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        if(rect.width > 0 && rect.height > 0) { // 过滤掉不可见的元素
            let customId = 'arachne-node-' + index;
            el.setAttribute('data-arachne-id', customId);
            interactiveNodes.push({
                id: customId,
                tag: el.tagName.toLowerCase(),
                text: el.innerText || el.value || el.placeholder || '',
                type: el.type || '',
                name: el.name || ''
            });
        }
    });
    return interactiveNodes;
}
"""

async def execute_ai_agent_navigator(node_config: dict, context: PipelineContext):
    model_name = node_config.get("model", "qwen-vl-max-latest")
    context.agent_model = model_name
    await log_queue.put({
        "type": "log", "level": "特工", "color": "\033[35m",
        "message": f"[Trace: {context.trace_id}] AI 隐匿具身雷达已就绪后台挂载。驱动核心: {model_name}。将默认为下游验证码和解密节点提供感知支援。",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return context
