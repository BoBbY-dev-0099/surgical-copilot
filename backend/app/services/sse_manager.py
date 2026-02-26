import asyncio
import logging
from typing import Set

logger = logging.getLogger(__name__)

class SSEManager:
    def __init__(self):
        self.subscribers: Set[asyncio.Queue] = set()

    async def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.subscribers.add(queue)
        logger.info(f"New SSE subscriber. Total: {len(self.subscribers)}")
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        if queue in self.subscribers:
            self.subscribers.remove(queue)
            logger.info(f"SSE subscriber disconnected. Total: {len(self.subscribers)}")

    async def broadcast(self, event_type: str, data: dict):
        if not self.subscribers:
            return
            
        message = {
            "event": event_type,
            "data": data
        }
        
        # We use a list to avoid "Set changed during iteration" if someone unsubscribes mid-broadcast
        for queue in list(self.subscribers):
            try:
                queue.put_nowait(message)
            except Exception as e:
                logger.error(f"Failed to put message in queue: {e}")

# Global instance
manager = SSEManager()
