import json
import os
import asyncio
from datetime import datetime, timezone
from core.logger import log_queue

class LocalIdentityPool:
    def __init__(self, filepath="data/identity_pool.json"):
        self.filepath = filepath
        self.lock = asyncio.Lock()
        self.identities = {}   # {"domain": {"uid_1": {...}, "uid_2": {...}}}
        self.cursors = {}      # {"domain": 0} 轮询光标
        self._load_from_disk()

    def _load_from_disk(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r', encoding='utf-8') as f:
                    self.identities = json.load(f)
            except Exception: pass

    def _save_to_disk(self):
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        with open(self.filepath, 'w', encoding='utf-8') as f:
            json.dump(self.identities, f, indent=2, ensure_ascii=False)

    async def inject_identity(self, domain: str, identity_data: dict, trace_id: str):
        """模式一：存入新鲜身份"""
        async with self.lock:
            if domain not in self.identities: self.identities[domain] = {}
            uid = identity_data.get("uid", f"usr_{int(datetime.now().timestamp()*1000)}")
            self.identities[domain][uid] = identity_data
            self._save_to_disk()
            await log_queue.put({"type": "log", "level": "入池", "color": "\x1b[32m", "message": f"[Trace: {trace_id}] 凭证安全持久化 (域: {domain}, UID: {uid})", "timestamp": datetime.now(timezone.utc).isoformat()})
            return uid

    async def extract_identity(self, domain: str, trace_id: str):
        """模式二：轮询分配独立身份"""
        async with self.lock:
            pool = self.identities.get(domain, {})
            active_uids = [uid for uid, data in pool.items() if data.get("status", "active") == "active"]
            if not active_uids: return None
            
            cursor = self.cursors.get(domain, 0) % len(active_uids)
            selected_uid = active_uids[cursor]
            self.cursors[domain] = cursor + 1
            
            identity = pool[selected_uid]
            identity["last_used"] = datetime.now(timezone.utc).isoformat()
            await log_queue.put({"type": "log", "level": "出池", "color": "\x1b[36m", "message": f"[Trace: {trace_id}] 认领独立身份容器 (域: {domain}, UID: {selected_uid})", "timestamp": datetime.now(timezone.utc).isoformat()})
            return identity

    async def invalidate_identity(self, domain: str, uid: str, trace_id: str, reason: str):
        """模式三：宣告死亡，熔断剔除"""
        async with self.lock:
            pool = self.identities.get(domain, {})
            if uid in pool and pool[uid].get("status") != "expired":
                pool[uid]["status"] = "expired"
                pool[uid]["expire_reason"] = reason
                self._save_to_disk()
                await log_queue.put({"type": "log", "level": "注销", "color": "\x1b[31m", "message": f"[Trace: {trace_id}] 凭证已熔断剔除！(域: {domain}, UID: {uid}) 原因: {reason}", "timestamp": datetime.now(timezone.utc).isoformat()})

GLOBAL_IDENTITY_POOL = LocalIdentityPool()
