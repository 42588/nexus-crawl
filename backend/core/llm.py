import os
import json
import base64
import asyncio
import aiohttp
from openai import AsyncOpenAI
import google.genai as genai

async def call_vision_llm(model_name: str, sys_prompt: str, user_prompt: str, screenshot_bytes: bytes, json_mode: bool = False):
    b64_img = base64.b64encode(screenshot_bytes).decode('utf-8')
    mime_type = "image/png"
    
    if model_name.startswith("gemini"):
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = genai.Client(apiKey=api_key)
        
        args = {
            "model": model_name,
            "contents": [sys_prompt, user_prompt, genai.types.Part.from_bytes(data=screenshot_bytes, mime_type=mime_type)]
        }
        if json_mode:
            args["config"] = genai.types.GenerateContentConfig(response_mime_type="application/json")
            
        resp = await asyncio.to_thread(client.models.generate_content, **args)
        return resp.text, getattr(resp.usage_metadata, "total_token_count", 0) if hasattr(resp, "usage_metadata") else 0

    elif model_name.startswith("gpt"):
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(api_key=api_key)
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}}
            ]}
        ]
        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        return response.choices[0].message.content, response.usage.total_tokens

    elif model_name.startswith("qwen"):
        api_key = os.environ.get("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise ValueError("DASHSCOPE_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}}
            ]}
        ]
        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        return response.choices[0].message.content, response.usage.total_tokens

    elif model_name.startswith("claude"):
        api_key = os.environ.get("CLAUDE_API_KEY", "")
        if not api_key:
            raise ValueError("CLAUDE_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        
        async with aiohttp.ClientSession() as session:
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            payload = {
                "model": model_name,
                "max_tokens": 1024,
                "system": sys_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt},
                            {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": b64_img}}
                        ]
                    }
                ]
            }
            async with session.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload) as response:
                res_data = await response.json()
                if response.status != 200:
                    raise ValueError(f"Claude API Error: {res_data}")
                text = res_data["content"][0]["text"]
                tokens = res_data["usage"]["input_tokens"] + res_data["usage"]["output_tokens"]
                return text, tokens

    elif model_name.startswith("glm-4v"):
        api_key = os.environ.get("ZHIPU_API_KEY", "")
        if not api_key:
            raise ValueError("ZHIPU_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(api_key=api_key, base_url="https://open.bigmodel.cn/api/paas/v4")
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}}
            ]}
        ]
        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        return response.choices[0].message.content, response.usage.total_tokens

    else:
        raise ValueError(f"Unsupported model: {model_name}")

async def call_text_llm(model_name: str, sys_prompt: str, user_prompt: str, json_mode: bool = False):
    if model_name.startswith("gemini"):
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = genai.Client(apiKey=api_key)
        
        args = {
            "model": model_name,
            "contents": [sys_prompt, user_prompt]
        }
        if json_mode:
            args["config"] = genai.types.GenerateContentConfig(response_mime_type="application/json")
            
        resp = await asyncio.to_thread(client.models.generate_content, **args)
        return resp.text, getattr(resp.usage_metadata, "total_token_count", 0) if hasattr(resp, "usage_metadata") else 0

    elif model_name.startswith("gpt"):
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        return response.choices[0].message.content, response.usage.total_tokens

    elif model_name.startswith("qwen"):
        api_key = os.environ.get("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise ValueError("DASHSCOPE_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        response = await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        return response.choices[0].message.content, response.usage.total_tokens

    elif model_name.startswith("claude"):
        api_key = os.environ.get("CLAUDE_API_KEY", "")
        if not api_key:
            raise ValueError("CLAUDE_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        
        async with aiohttp.ClientSession() as session:
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            payload = {
                "model": model_name,
                "max_tokens": 1024,
                "system": sys_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt}
                        ]
                    }
                ]
            }
            async with session.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload) as response:
                res_data = await response.json()
                if response.status != 200:
                    raise ValueError(f"Claude API Error: {res_data}")
                text = res_data["content"][0]["text"]
                tokens = res_data["usage"]["input_tokens"] + res_data["usage"]["output_tokens"]
                return text, tokens

    elif model_name.startswith("deepseek"):
        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(api_key=api_key, base_url="https://api.deepseek.com/v1")
        
        args = {
            "model": model_name,
            "messages": [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}]
        }
        if json_mode and model_name == "deepseek-chat":
            args["response_format"] = {"type": "json_object"}
            
        response = await client.chat.completions.create(**args)
        return response.choices[0].message.content, response.usage.total_tokens

    elif model_name.startswith("glm"):
        api_key = os.environ.get("ZHIPU_API_KEY", "")
        if not api_key:
            raise ValueError("ZHIPU_API_KEY is missing. 请在 AI Studio 设置中配置环境变量。")
        client = AsyncOpenAI(api_key=api_key, base_url="https://open.bigmodel.cn/api/paas/v4")
        response = await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        return response.choices[0].message.content, response.usage.total_tokens

    else:
        raise ValueError(f"Unsupported model: {model_name}")
