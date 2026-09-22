"""Scrapes CBSE's public sports results portal for the Gold-medal (rank 1)
winning school of each Cluster/age-group, as an alternative to hand-
transcribing the WINNERS table in seed_cluster_winners_active.py from a
results spreadsheet.

Only affiliation numbers and school names are kept — student name, DOB and
father's name (present in the scraped rows) are discarded in memory and
never written to disk, matching this project's existing rule of not
committing CBSE's per-student personal data (see seed_cluster_winners_active.py).

For each Cluster x age group, a school can have a couple of individual
students mistagged with the wrong medal in CBSE's own data. Like the
spreadsheet-based transcription this replaces, the winner is decided by
majority vote: whichever school has the most Gold-tagged rows in that
Cluster/age-group is treated as the winner, even if 1-2 of its own
students are mistagged.

Run:
    python -m app.scrape_cbse_cluster_gold --year 2026
    python -m app.scrape_cbse_cluster_gold --year 2026 --game "Kabaddi" --gender Male

Prints a WINNERS-shaped Python list to paste into
seed_cluster_winners_active.py, plus any Cluster/age-group that returned no
Gold row at all (worth checking by hand — could mean no results posted yet).
"""
from __future__ import annotations

import argparse
from collections import Counter

from .cbse_scraper import CBSESportsClient

AGE_GROUP_CODE = {"Under 14": "U-14", "Under 17": "U-17", "Under 19": "U-19"}


def roman_key(cluster_zone: str) -> tuple[int, str]:
    """Sorts 'Cluster II' before 'Cluster X' before 'Cluster XX'."""
    roman = cluster_zone.removeprefix("Cluster ").strip()
    values = {"I": 1, "V": 5, "X": 10}
    total = 0
    for i, ch in enumerate(roman):
        v = values[ch]
        if i + 1 < len(roman) and values[roman[i + 1]] > v:
            total -= v
        else:
            total += v
    return (total, cluster_zone)


def run(year: int, game_name: str, gender: str, request_delay: float) -> None:
    client = CBSESportsClient(request_delay=request_delay)

    games = client.get_games()
    game = next((g for g in games if g["text"].lower() == game_name.lower()), None)
    if game is None:
        available = ", ".join(g["text"] for g in games if g["value"] != "0")
        raise SystemExit(f"Game {game_name!r} not found. Available: {available}")
    game_id = game["value"]

    age_groups = [g for g in client.get_age_groups(game_id, year) if g["value"] != "0"]
    if not age_groups:
        raise SystemExit(f"No age groups returned for {game_name} / {year}")

    cluster_zones = [
        z["value"]
        for z in client.get_cluster_zones("Cluster")
        if z["value"].startswith("Cluster ") and "F-" not in z["value"]
    ]
    cluster_zones.sort(key=roman_key)

    winners: list[tuple[str, str, str, str]] = []  # cluster, age code, aff no, school name
    empty: list[tuple[str, str]] = []
    ambiguous: list[tuple[str, str, list[tuple[str, str, int]]]] = []

    for cluster_zone in cluster_zones:
        cluster_roman = cluster_zone.removeprefix("Cluster ").strip()
        for age_group in age_groups:
            age_label = age_group["text"]
            age_code = AGE_GROUP_CODE.get(age_label, age_label)

            events = client.get_events(game_id, gender, age_label, year)
            events = [e for e in events if e["value"] != "0"]
            if not events:
                empty.append((cluster_roman, age_code))
                continue
            events_value = events[0]["value"]

            rows = client.search(
                year=year,
                level="Cluster",
                cluster_zone=cluster_zone,
                gender=gender,
                game_id=game_id,
                age_group_value=age_group["value"],
                events_value=events_value,
            )
            gold_rows = [r for r in rows if "gold" in r.medal.lower()]
            if not gold_rows:
                empty.append((cluster_roman, age_code))
                continue

            counts = Counter((r.affiliation_no, r.school_name) for r in gold_rows)
            ranked = counts.most_common()
            (aff, school_name), top_count = ranked[0]
            winners.append((cluster_roman, age_code, aff, school_name))

            if len(ranked) > 1 and ranked[1][1] >= top_count:
                ambiguous.append((cluster_roman, age_code, [(a, s, c) for (a, s), c in ranked]))

    print("WINNERS = [")
    for cluster, age_code, aff, school_name in winners:
        print(f'    ("{cluster}", "{age_code}", "{aff}", "{school_name}"),')
    print("]")

    if empty:
        print(f"\n# {len(empty)} Cluster/age-group(s) with no Gold row (check by hand):")
        for cluster, age_code in empty:
            print(f"#   Cluster {cluster} {age_code}")

    if ambiguous:
        print(f"\n# {len(ambiguous)} Cluster/age-group(s) with a Gold-count tie (check by hand):")
        for cluster, age_code, ranked in ambiguous:
            print(f"#   Cluster {cluster} {age_code}: {ranked}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="e.g. 2026 for the 2026-27 season")
    parser.add_argument("--game", default="Kabaddi")
    parser.add_argument("--gender", default="Male", choices=["Male", "Female"])
    parser.add_argument("--request-delay", type=float, default=0.5, help="seconds between requests")
    args = parser.parse_args()
    run(args.year, args.game, args.gender, args.request_delay)
