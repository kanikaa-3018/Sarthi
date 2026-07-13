from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import settings


@dataclass
class Neo4jStatus:
    available: bool
    reason: str | None = None


class Neo4jClient:
    def __init__(self) -> None:
        self._driver = None
        self.status = Neo4jStatus(False, "driver_not_initialized")

    def connect(self) -> Neo4jStatus:
        try:
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_username, settings.neo4j_password),
            )
            with self._driver.session() as session:
                session.run("RETURN 1").consume()
            self.status = Neo4jStatus(True)
        except Exception as exc:  # pragma: no cover - depends on local Neo4j
            self._driver = None
            self.status = Neo4jStatus(False, str(exc))
        return self.status

    def close(self) -> None:
        if self._driver:
            self._driver.close()

    def run_write(self, query: str, parameters: dict[str, Any] | None = None) -> list[dict]:
        if not self._driver:
            raise RuntimeError("Neo4j driver unavailable")
        with self._driver.session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]

    def run_read(self, query: str, parameters: dict[str, Any] | None = None) -> list[dict]:
        return self.run_write(query, parameters)


def get_neo4j_client() -> Neo4jClient:
    client = Neo4jClient()
    client.connect()
    return client

