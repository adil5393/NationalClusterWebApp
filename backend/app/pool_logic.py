"""Pure, DB-free logic for the league/pool stage: how many teams go in each
pool, and which pairs play each other. Kept separate from routers/pools.py so
these are trivially unit-testable (see tests/test_league_pools.py) without a
database or running server.
"""
from itertools import combinations

MIN_POOL_SIZE = 2


def _spread_sizes(team_count: int, pool_count: int) -> list[int]:
    """team_count teams split across exactly pool_count pools, as evenly as
    possible: every pool gets the floor amount, and the remainder is handed
    out one-by-one to the *last* pools (wrapping around if there are more
    extra teams than pools) rather than becoming its own undersized pool."""
    base = team_count // pool_count
    remainder = team_count % pool_count
    sizes = [base] * pool_count
    for k in range(remainder):
        idx = pool_count - 1 - (k % pool_count)
        sizes[idx] += 1
    return sizes


def distribute_pool_sizes(team_count: int, target_size: int = MIN_POOL_SIZE) -> list[int]:
    """How many teams each pool should get for a balanced pool stage.

    Every pool has at least `target_size` teams (the organizer's chosen
    teams-per-pool, defaulting to MIN_POOL_SIZE) — a remainder never becomes
    its own undersized pool; instead it's spread one-by-one across the
    *last* pools (so e.g. 21 teams at target_size=5 -> [5, 5, 5, 6], 24 teams
    -> [6, 6, 6, 6]), wrapping around if there are more extra teams than
    pools (e.g. 9 teams, with only 1 possible pool, all land in that one
    pool: [9]).

    Raises ValueError if target_size is below the system floor, or if there
    aren't enough teams to form even one pool at that size.
    """
    if target_size < MIN_POOL_SIZE:
        raise ValueError(f"Teams per pool can't be below the minimum of {MIN_POOL_SIZE}")
    if team_count < target_size:
        raise ValueError(f"Need at least {target_size} teams to form a pool (got {team_count})")

    return _spread_sizes(team_count, team_count // target_size)


def distribute_pool_sizes_power_of_two(team_count: int, min_teams_per_pool: int = MIN_POOL_SIZE) -> list[int]:
    """Same idea as distribute_pool_sizes, but guarantees the number of
    pools is itself a power of two — required whenever Round 2's knockout
    bracket is pre-wired directly to pool pairs before any pool is played
    (see routers/matches.py generate_bracket's whole-season LEAGUE path),
    since halving pool pairs at every subsequent knockout round only works
    if the pool count starts as a clean power of two.

    team_count // min_teams_per_pool gives the largest pool count that keeps
    every pool at or above the minimum; this rounds that DOWN to the nearest
    power of two (rounding up would drop some pools below the minimum), then
    spreads teams across that many pools exactly like distribute_pool_sizes
    does — so pools can end up bigger than min_teams_per_pool, never smaller.
    E.g. 39 teams at a 4-per-pool minimum: naive = 39 // 4 = 9 pools, rounded
    down to 8 -> sizes [4, 5, 5, 5, 5, 5, 5, 5] (sum 39).

    Raises ValueError if min_teams_per_pool is below the system floor, or if
    there aren't enough teams to form even 2 pools at that minimum (the
    smallest possible power of two).
    """
    if min_teams_per_pool < MIN_POOL_SIZE:
        raise ValueError(f"Teams per pool can't be below the minimum of {MIN_POOL_SIZE}")
    naive_pool_count = team_count // min_teams_per_pool
    if naive_pool_count < 2:
        raise ValueError(
            f"Need at least {2 * min_teams_per_pool} teams to form 2 pools of {min_teams_per_pool} (got {team_count})"
        )
    pool_count = 1 << (naive_pool_count.bit_length() - 1)  # largest power of two <= naive_pool_count
    return _spread_sizes(team_count, pool_count)


def round_robin_pairs(team_ids: list[int]) -> list[tuple[int, int]]:
    """Every unique pair exactly once, no self-pairs, no duplicates.
    n teams -> n(n-1)/2 pairs."""
    return list(combinations(team_ids, 2))
