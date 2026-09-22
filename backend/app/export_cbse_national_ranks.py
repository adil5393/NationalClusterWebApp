"""Exports CBSE's live National-level Kabaddi standings (Rank 1-4 per age
group) to an .xlsx, scraped from academic.cbseit.in/sports.

Same Gold/Silver/2xBronze = Rank 1-4 structure as the Cluster round (see
export_cbse_cluster_ranks.py), just queried at nameoflevel=National,
clusterzone=National instead of looping over each Cluster.

Run:
    python -m app.export_cbse_national_ranks --year 2025 --out ../cbse_kabaddi_2025-26_national_ranks.xlsx
"""
from __future__ import annotations

import argparse

from openpyxl import Workbook
from openpyxl.styles import Font

from .cbse_scraper import CBSESportsClient
from .export_cbse_cluster_ranks import ranks_for_cluster


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

    wb = Workbook()
    sheet = wb.active
    sheet.title = "National"
    header = ["Age Group"]
    for rank in (1, 2, 3, 4):
        header += [f"Rank {rank} School Code", f"Rank {rank} School Name"]
    sheet.append(header)
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    issues: list[str] = []

    for age_group in age_groups:
        age_label = age_group["text"]
        events = [e for e in client.get_events(game_id, gender, age_label, year) if e["value"] != "0"]
        if not events:
            issues.append(f"{age_label}: no events found at all")
            continue
        events_value = events[0]["value"]

        rows = client.search(
            year=year,
            level="National",
            cluster_zone="National",
            gender=gender,
            game_id=game_id,
            age_group_value=age_group["value"],
            events_value=events_value,
        )
        ranks = ranks_for_cluster(rows)
        if len(ranks) < 4:
            issues.append(f"{age_label}: only {len(ranks)} rank(s) resolved (expected 4) — check by hand")

        row = [age_label]
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
    parser.add_argument("--out", default="cbse_national_ranks.xlsx")
    parser.add_argument("--request-delay", type=float, default=0.5, help="seconds between requests")
    args = parser.parse_args()
    run(args.year, args.game, args.gender, args.out, args.request_delay)
