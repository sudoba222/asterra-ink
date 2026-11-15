"""Field polygon checks and area, without heavy GIS libraries."""

import math

EARTH_RADIUS_M = 6_371_008.8

Point = tuple[float, float]  # (lon, lat)


def close_ring(points: list[Point]) -> list[Point]:
    """Return the ring with the first point repeated at the end (GeoJSON needs a closed ring)."""
    return points if points[0] == points[-1] else [*points, points[0]]


def distinct_points(points: list[Point]) -> int:
    return len({(round(lon, 7), round(lat, 7)) for lon, lat in points})


def area_hectares(points: list[Point]) -> float:
    """Area of a lon/lat ring on a sphere (spherical excess formula), in hectares."""
    ring = close_ring(points)
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(ring, ring[1:], strict=False):
        total += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(total) * EARTH_RADIUS_M**2 / 2 / 10_000


def _segments_cross(a: Point, b: Point, c: Point, d: Point) -> bool:
    def orient(p: Point, q: Point, r: Point) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    d1, d2 = orient(c, d, a), orient(c, d, b)
    d3, d4 = orient(a, b, c), orient(a, b, d)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and 0 not in (d1, d2, d3, d4)


def self_intersects(points: list[Point]) -> bool:
    """True if two non-neighbouring edges of the ring cross (a "bow-tie" polygon)."""
    ring = close_ring(points)
    edges = list(zip(ring, ring[1:], strict=False))
    n = len(edges)
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue  # first and last edge share a corner
            if _segments_cross(*edges[i], *edges[j]):
                return True
    return False
