"""Name pools for seed fixtures.

UHAS Basic School sits in the Volta Region, an Ewe-majority area, so
the roster should read that way rather than generic. Mostly Ewe names,
mixed with common Akan/Ga names to reflect a realistic mixed-heritage
staff and student body.

Names are picked by index (`pick(pool, i)`), not randomly — the seed
script must produce the exact same roster on every run.
"""

from __future__ import annotations

MALE_FIRST_NAMES: tuple[str, ...] = (
    "Yayra",
    "Selorm",
    "Elikem",
    "Edem",
    "Kodzo",
    "Dela",
    "Fiifi",
    "Senyo",
    "Klenam",
    "Mawuli",
    "Elorm",
    "Sedem",
    "Kekeli",
    "Dzifa",
    "Kwame",
    "Kofi",
    "Yaw",
    "Nii",
    "Torgbui",
    "Dumega",
    "Gameli",
    "Kwabena",
    "Setor",
    "Bright",
)

FEMALE_FIRST_NAMES: tuple[str, ...] = (
    "Akorfa",
    "Dzifa",
    "Efua",
    "Elikem",
    "Mawusi",
    "Sedinam",
    "Sena",
    "Delali",
    "Enam",
    "Worlali",
    "Selassie",
    "Yayra",
    "Adjoa",
    "Ama",
    "Abena",
    "Adzo",
    "Akua",
    "Naa",
    "Elom",
    "Mawuena",
    "Dede",
    "Emefa",
    "Sitsofe",
    "Perpetual",
)

LAST_NAMES: tuple[str, ...] = (
    "Agbenyega",
    "Adzogenu",
    "Mensah",
    "Asare",
    "Doe",
    "Kpodo",
    "Tornu",
    "Agbeko",
    "Amenyo",
    "Dogbe",
    "Fiawoo",
    "Gbedemah",
    "Hodo",
    "Kutsoati",
    "Lawluvi",
    "Mensimah",
    "Nutsugah",
    "Ocloo",
    "Quist",
    "Sedegah",
    "Torgbor",
    "Vinorkor",
    "Woelinam",
    "Yawson",
    "Zigah",
    "Attipoe",
    "Bansah",
    "Christian",
)


def pick(pool: tuple[str, ...], i: int) -> str:
    return pool[i % len(pool)]


def full_name(i: int, *, female: bool) -> tuple[str, str]:
    """Returns (first_name, last_name) for the i-th person of the given gender.

    Offsetting the last-name index by the first-name pool length keeps
    male/female cohorts from pairing with the same last names in the
    same order, so siblings/classmates don't all look alike.
    """
    first_pool = FEMALE_FIRST_NAMES if female else MALE_FIRST_NAMES
    first = pick(first_pool, i)
    last = pick(LAST_NAMES, i + (len(FEMALE_FIRST_NAMES) if female else 0))
    return first, last
