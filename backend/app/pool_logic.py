"""Pure, DB-free logic for the league/pool stage: how many teams go in each
pool, and which pairs play each other. Kept separate from routers/pools.py so
these are trivially unit-testable (see tests/test_league_pools.py) without a
database or running server.
"""
from itertools import combinations

MIN_POOL_SIZE = 5


def distribute_pool_sizes(team_count: int) -> list[int]:
    """How many teams each pool should get for a balanced pool stage.

    Every pool has at least MIN_POOL_SIZE teams — a remainder never becomes
    its own undersized pool; instead it's spread one-by-one across the
    *last* pools (so e.g. 21 teams -> [5, 5, 5, 6], 24 teams -> [6, 6, 6, 6]),
    wrapping around if there are more extra teams than pools (e.g. 9 teams,
    with only 1 possible pool, all land in that one pool: [9]).

    Raises ValueError if there aren't enough teams to form even one pool.
    """
    if team_count < MIN_POOL_SIZE:
        raise ValueError(f"Need at least {MIN_POOL_SIZE} teams to form a pool (got {team_count})")

    base_pools = team_count // MIN_POOL_SIZE
    remainder = team_count % MIN_POOL_SIZE

    sizes = [MIN_POOL_SIZE] * base_pools
    for k in range(remainder):
        idx = base_pools - 1 - (k % base_pools)
        sizes[idx] += 1
    return sizes


def round_robin_pairs(team_ids: list[int]) -> list[tuple[int, int]]:
    """Every unique pair exactly once, no self-pairs, no duplicates.
    n teams -> n(n-1)/2 pairs."""
    return list(combinations(team_ids, 2))
