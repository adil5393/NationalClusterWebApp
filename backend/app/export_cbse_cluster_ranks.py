"""Exports CBSE's live Cluster-round Kabaddi standings (Rank 1-4 per Cluster
per age group) to an .xlsx, scraped from academic.cbseit.in/sports.

Each Cluster/age-group has exactly 4 participating schools: Gold (Rank 1),
Silver (Rank 2), and two Bronze (Ranks 3-4, ordered by first appearance in
CBSE's own table since CBSE doesn't distinguish an order between them).

Only affiliation number + school name are kept, not any per-student data
(name/DOB/father's name) — same rule as seed_cluster_winners_active.py.

Run:
    python -m app.export_cbse_cluster_ranks --year 2025 --out ../cbse_kabaddi_2025-26_cluster_ranks.xlsx
"""
from __future__ import annotations

import argparse
from collections import OrderedDict

from openpyxl import Workbook
from openpyxl.styles import Font

from .cbse_scraper import CBSESportsClient

MEDAL_RANKS = {"gold": 1, "silver": 2, "bronze": 3}  # bronze splits into 3 and 4 by order seen


def roman_key(cluster_zone: str) -> tuple[int, str]:
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


def ranks_for_cluster(rows) -> dict[int, tuple[str, str]]:
    """Returns {rank: (affiliation_no, school_name)} for one Cluster/age-group's rows."""
    schools: "OrderedDict[str, dict]" = OrderedDict()
    for r in rows:
        entry = schools.setdefault(r.affiliation_no, {"name": r.school_name, "medal": None})
        for medal_name in MEDAL_RANKS:
            if medal_name in r.medal.lower():
                entry["medal"] = medal_name
                break

    gold = [aff for aff, e in schools.items() if e["medal"] == "gold"]
    silver = [aff for aff, e in schools.items() if e["medal"] == "silver"]
    bronze = [aff for aff, e in schools.items() if e["medal"] == "bronze"]

    ranks: dict[int, tuple[str, str]] = {}
    if gold:
        ranks[1] = (gold[0], schools[gold[0]]["name"])
    if silver:
        ranks[2] = (silver[0], schools[silver[0]]["name"])
    for i, aff in enumerate(bronze[:2]):
        ranks[3 + i] = (aff, schools[aff]["name"])
    return ranks


def run(year: int, game_name: str, gender: str, out_path: str, request_delay: float) -> None:
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

    wb = Workbook()
    wb.remove(wb.active)
    issues: list[str] = []

    for age_group in age_groups:
        age_label = age_group["text"]
        sheet = wb.create_sheet(title=age_label[:31])
        header = ["Cluster"]
        for rank in (1, 2, 3, 4):
            header += [f"Rank {rank} School Code", f"Rank {rank} School Name"]
        sheet.append(header)
        for cell in sheet[1]:
            cell.font = Font(bold=True)

        events = [e for e in client.get_events(game_id, gender, age_label, year) if e["value"] != "0"]
        if not events:
            issues.append(f"{age_label}: no events found at all")
            continue
        events_value = events[0]["value"]

        for cluster_zone in cluster_zones:
            cluster_roman = cluster_zone.removeprefix("Cluster ").strip()
            rows = client.search(
                year=year,
                level="Cluster",
                cluster_zone=cluster_zone,
                gender=gender,
                game_id=game_id,
                age_group_value=age_group["value"],
                events_value=events_value,
            )
            ranks = ranks_for_cluster(rows)
            if len(ranks) < 4:
                issues.append(
                    f"Cluster {cluster_roman} / {age_label}: only {len(ranks)} rank(s) resolved "
                    f"(expected 4) — check by hand"
                )
            row = [cluster_roman]
            for rank in (1, 2, 3, 4):
                aff, name = ranks.get(rank, ("", ""))
                row += [aff, name]
            sheet.append(row)

        for col in sheet.columns:
            width = max(len(str(c.value)) for c in col if c.value is not None) if any(c.value for c in col) else 10
            sheet.column_dimensions[col[0].column_letter].width = min(max(width + 2, 10), 45)

    wb.save(out_path)
    print(f"Wrote {out_path}")
    if issues:
        print(f"\n{len(issues)} thing(s) to check by hand:")
        for issue in issues:
            print(f"  - {issue}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="e.g. 2025 for the 2025-26 season")
    parser.add_argument("--game", default="Kabaddi")
    parser.add_argument("--gender", default="Male", choices=["Male", "Female"])
    parser.add_argument("--out", default="cbse_cluster_ranks.xlsx")
    parser.add_argument("--request-delay", type=float, default=0.5, help="seconds between requests")
    args = parser.parse_args()
    run(args.year, args.game, args.gender, args.out, args.request_delay)
