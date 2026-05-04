import asyncio
import json
import os
import hashlib

class MetricsTracker:
    def __init__(self):
        self.total_blocked = 0
        self.llm_tokens = 0
        self.current_throughput = 0
        self.current_evasion_failures = 0
        self.current_captchas_bypassed = 0
        
        self.session_llm_tokens = 0
        self.session_llm_calls = 0
        self.session_throughput_total = 0
        self.session_blocked_total = 0
        self.session_bypassed_total = 0
        self.session_scraped_items = 0
        
        self.total_latency = 0
        self.active_proxies = set()
        self.captchas_bypassed = 0
        self.saved_characters = 0
        self.geo_counts = {
            'US-East': 0, 'EU-West': 0, 'AP-South': 0, 'US-West': 0, 'EU-Central': 0
        }
        self.lock = asyncio.Lock()
        self.load()

    def reset_session(self):
        self.session_llm_tokens = 0
        self.session_llm_calls = 0
        self.session_throughput_total = 0
        self.session_blocked_total = 0
        self.session_bypassed_total = 0
        self.session_scraped_items = 0
        self.active_proxies.clear()
        
    def load(self):
        if os.path.exists("./metrics.json"):
            try:
                with open("./metrics.json", "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.total_blocked = data.get("total_blocked", 0)
                    self.llm_tokens = data.get("llm_tokens", 0)
                    self.captchas_bypassed = data.get("captchas_bypassed", 0)
                    self.saved_characters = data.get("saved_characters", 0)
            except:
                pass

    def save_sync(self):
        try:
            with open("./metrics.json", "w", encoding="utf-8") as f:
                json.dump({
                    "total_blocked": self.total_blocked,
                    "llm_tokens": self.llm_tokens,
                    "captchas_bypassed": self.captchas_bypassed,
                    "saved_characters": self.saved_characters
                }, f)
        except:
            pass

    def _assign_proxy_region(self, proxy_str):
        # Deterministically assign a valid region using a hash of the proxy string
        regions = list(self.geo_counts.keys())
        proxy_hash = int(hashlib.md5(str(proxy_str).encode('utf-8')).hexdigest(), 16)
        region = regions[proxy_hash % len(regions)]
        self.geo_counts[region] += 1

    async def increment_throughput(self, count=1, latency=0, proxy=None):
        async with self.lock:
            self.current_throughput += count
            self.session_throughput_total += count
            self.total_latency += latency
            if proxy and proxy not in self.active_proxies:
                self.active_proxies.add(proxy)
                self._assign_proxy_region(proxy)

    async def increment_failures(self, count=1, latency=0, proxy=None):
        async with self.lock:
            self.current_evasion_failures += count
            self.session_blocked_total += count
            self.total_blocked += count
            self.total_latency += latency
            if proxy and proxy not in self.active_proxies:
                self.active_proxies.add(proxy)
                self._assign_proxy_region(proxy)
            self.save_sync()

    async def increment_captchas(self, count=1):
        async with self.lock:
            self.captchas_bypassed += count
            self.session_bypassed_total += count
            self.current_captchas_bypassed += count
            self.save_sync()

    async def add_tokens(self, count):
        async with self.lock:
            self.llm_tokens += count
            self.session_llm_tokens += count
            self.session_llm_calls += 1
            self.save_sync()

    async def add_saved_characters(self, count):
        async with self.lock:
            self.saved_characters += count
            self.save_sync()

    async def add_scraped_item(self, count=1):
        async with self.lock:
            self.session_scraped_items += count

GLOBAL_METRICS = MetricsTracker()
