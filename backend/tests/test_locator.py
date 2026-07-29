import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.models import ConversationMessage, LocateRequest  # noqa: E402
from app.services import locator  # noqa: E402


def _history() -> list[ConversationMessage]:
    return [
        ConversationMessage(role="user", content="上海 徐汇", step=1),
        ConversationMessage(
            role="agent",
            content="徐汇很大，武康路、安福路、永嘉路里选一个？",
            step=1,
        ),
    ]


class LocatorContextTest(unittest.TestCase):
    def test_contextual_queries_use_user_location_context_only(self) -> None:
        queries = locator._contextual_queries("武康路", _history())

        self.assertEqual(queries[0], "上海 徐汇 武康路")
        self.assertIn("武康路 上海 徐汇", queries)
        self.assertNotIn("安福路", " ".join(queries))
        self.assertEqual(len(queries), len(set(queries)))

    def test_nominatim_candidate_prefers_municipality_state_as_city(self) -> None:
        candidate = locator._nominatim_item_to_candidate({
            "lat": "31.2079627",
            "lon": "121.4345823",
            "display_name": "武康路, 湖南路街道, 徐汇区, 上海市, 中国",
            "address": {
                "road": "武康路",
                "suburb": "湖南路街道",
                "city": "徐汇区",
                "state": "上海市",
                "country": "中国",
            },
        })

        self.assertEqual(candidate["city"], "上海")
        self.assertEqual(candidate["neighborhood"], "武康路")
        self.assertEqual(candidate["longitude"], 121.4345823)
        self.assertEqual(candidate["latitude"], 31.2079627)

    def test_geocode_place_falls_back_when_mapbox_rejects_token(self) -> None:
        calls: list[tuple[str, str]] = []

        async def fake_mapbox(query: str) -> dict | None:
            calls.append(("mapbox", query))
            raise locator.GeocodeProviderError("bad token")

        async def fake_nominatim(query: str) -> dict | None:
            calls.append(("nominatim", query))
            if query == "上海 徐汇 武康路":
                return {
                    "city": "上海",
                    "neighborhood": "武康路",
                    "display": "武康路, 徐汇区, 上海市, 中国",
                    "longitude": 121.4345823,
                    "latitude": 31.2079627,
                }
            return None

        original_mapbox = locator._mapbox_geocode
        original_nominatim = locator._nominatim_geocode
        locator._mapbox_geocode = fake_mapbox
        locator._nominatim_geocode = fake_nominatim
        try:
            result = asyncio.run(locator._geocode_place("武康路", _history()))
        finally:
            locator._mapbox_geocode = original_mapbox
            locator._nominatim_geocode = original_nominatim

        self.assertEqual(result["city"], "上海")
        self.assertEqual(result["neighborhood"], "武康路")
        self.assertEqual(calls[:2], [
            ("mapbox", "上海 徐汇 武康路"),
            ("nominatim", "上海 徐汇 武康路"),
        ])

    def test_locate_returns_latest_geocoded_candidate_before_confirm(self) -> None:
        class FakeClient:
            def __init__(self) -> None:
                self.calls = 0
                self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

            def create(self, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    return SimpleNamespace(choices=[
                        SimpleNamespace(message=SimpleNamespace(
                            content="",
                            tool_calls=[
                                SimpleNamespace(
                                    id="call-1",
                                    function=SimpleNamespace(
                                        name="geocode_place",
                                        arguments=json.dumps({"query": "武康路"}, ensure_ascii=False),
                                    ),
                                )
                            ],
                        ))
                    ])
                return SimpleNamespace(choices=[
                    SimpleNamespace(message=SimpleNamespace(
                        content="查到了，武康路，徐汇区湖南路街道那片。这个落点能接受吗？",
                        tool_calls=None,
                    ))
                ])

        async def fake_geocode(_query: str, _history: list[ConversationMessage] | None) -> dict:
            return {
                "city": "上海",
                "neighborhood": "武康路",
                "display": "武康路, 徐汇区, 上海市, 中国",
                "longitude": 121.4345823,
                "latitude": 31.2079627,
            }

        fake_client = FakeClient()
        original_client = locator._client
        original_model = locator._model
        original_geocode_place = locator._geocode_place
        locator._client = lambda: fake_client
        locator._model = lambda: "fake-model"
        locator._geocode_place = fake_geocode
        try:
            result = asyncio.run(locator.locate(LocateRequest(input="武康路", conversation_history=_history())))
        finally:
            locator._client = original_client
            locator._model = original_model
            locator._geocode_place = original_geocode_place

        self.assertEqual(result.candidate.city, "上海")
        self.assertEqual(result.candidate.neighborhood, "武康路")
        self.assertIn("武康路", result.reply)


if __name__ == "__main__":
    unittest.main()
