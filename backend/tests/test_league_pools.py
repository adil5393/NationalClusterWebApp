"""Unit tests for the league/pool-stage algorithms (backend/app/pool_logic.py).

Unlike the other test_*.py files in this directory, these need no running
server or database — distribute_pool_sizes/round_robin_pairs are pure
functions, so they're tested directly by import. Run with:

    cd backend && python -m pytest tests/test_league_pools.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.pool_logic import MIN_POOL_SIZE, distribute_pool_sizes, round_robin_pairs  # noqa: E402


class TestDistributePoolSizes:
    @pytest.mark.parametrize("team_count,expected", [
        (20, [5, 5, 5, 5]),
        (21, [5, 5, 5, 6]),
        (22, [5, 5, 6, 6]),
        (23, [5, 6, 6, 6]),
        (24, [6, 6, 6, 6]),
        (25, [5, 5, 5, 5, 5]),
        (5, [5]),
        (6, [6]),
        (9, [9]),  # only 1 possible pool — all extras land in it, not a second undersized pool
        (10, [5, 5]),
        (11, [5, 6]),
    ])
    def test_known_distributions(self, team_count, expected):
        assert distribute_pool_sizes(team_count) == expected

    def test_never_below_minimum(self):
        for n in range(MIN_POOL_SIZE, 200):
            sizes = distribute_pool_sizes(n)
            assert all(s >= MIN_POOL_SIZE for s in sizes), f"n={n} produced {sizes}"

    def test_sizes_sum_to_team_count(self):
        for n in range(MIN_POOL_SIZE, 200):
            assert sum(distribute_pool_sizes(n)) == n

    def test_balanced_spread(self):
        # No pool should ever be more than 1 team larger than the smallest.
        for n in range(MIN_POOL_SIZE, 200):
            sizes = distribute_pool_sizes(n)
            assert max(sizes) - min(sizes) <= 1, f"n={n} produced unbalanced {sizes}"

    def test_below_minimum_raises(self):
        for n in range(0, MIN_POOL_SIZE):
            with pytest.raises(ValueError):
                distribute_pool_sizes(n)


class TestRoundRobinPairs:
    @pytest.mark.parametrize("n,expected_matches", [(5, 10), (6, 15), (7, 21), (2, 1), (10, 45)])
    def test_match_count(self, n, expected_matches):
        pairs = round_robin_pairs(list(range(n)))
        assert len(pairs) == expected_matches
        assert len(pairs) == n * (n - 1) // 2

    def test_no_self_matches(self):
        pairs = round_robin_pairs(list(range(8)))
        assert all(a != b for a, b in pairs)

    def test_no_duplicate_pairings(self):
        pairs = round_robin_pairs(list(range(8)))
        seen = {frozenset(p) for p in pairs}
        assert len(seen) == len(pairs)

    def test_every_team_plays_every_other_team_exactly_once(self):
        teams = [10, 20, 30, 40, 50]
        pairs = round_robin_pairs(teams)
        expected = {frozenset(p) for p in [
            (10, 20), (10, 30), (10, 40), (10, 50),
            (20, 30), (20, 40), (20, 50),
            (30, 40), (30, 50),
            (40, 50),
        ]}
        assert {frozenset(p) for p in pairs} == expected

    def test_uses_real_team_ids_not_indices(self):
        pairs = round_robin_pairs([101, 202, 303])
        flat = {t for pair in pairs for t in pair}
        assert flat == {101, 202, 303}
