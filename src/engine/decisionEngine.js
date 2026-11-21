/**
 * CraveLock adaptive elimination and scoring engine.
 * Hard-filters strictly on dietary compliance and optional travel-safe constraints,
 * then applies deterministic weighted scoring across heaviness, macros, sensory choices,
 * and 72-hour repeat cooldowns so every path finishes with strong Round 5 contenders.
 */

export const DIET_OPTIONS = [
  {
    id: 'veg',
    label: 'Pure Veg',
    shortDesc: 'Zero egg or meat',
  },
  {
    id: 'jain',
    label: 'Jain-Friendly',
    shortDesc: 'No onion, garlic, or root veg',
  },
  {
    id: 'egg',
    label: 'Veg + Egg',
    shortDesc: 'Eggitarian & vegetarian',
  },
  {
    id: 'non-veg',
    label: 'Non-Veg',
    shortDesc: 'Chicken, mutton, seafood & egg',
  },
];

export const HEAVINESS_OPTIONS = [
  {
    id: 'light',
    label: 'Light & Clean',
    subtitle: 'Easy digestion, zero post-meal fog',
  },
  {
    id: 'balanced',
    label: 'Balanced Meal',
    subtitle: 'Satisfying everyday dinner or lunch',
  },
  {
    id: 'indulgent',
    label: 'Indulgent Feast',
    subtitle: 'Rich, buttery, slow-simmered comfort',
  },
  {
    id: 'snack',
    label: 'Evening Tiffin / Snack',
    subtitle: 'Lighter bites, chaats, rolls & tiffin',
  },
];

export const SENSORY_ROUNDS = [
  {
    key: 'baseFormat',
    eyebrow: 'Round 1 of 5 - Base Format',
    prompt: 'What foundation sounds right tonight?',
    optionA: {
      value: 'rice_bowl',
      title: 'Grains, Rice, Biryani & Bowls',
      subtitle: 'Warm spoonable bowls, steamed rice, biryani, khichdi, noodles, or curated meal bowls.',
      tags: ['Spoonable', 'Biryani & Khichdi', 'Noodles & Bowls'],
    },
    optionB: {
      value: 'bread_dosa_wrap',
      title: 'Hot Breads, Dosas, Rotis & Hand-Helds',
      subtitle: 'Crisp dosas, flaky parottas, tandoori rotis, naan scoops, wraps, or tiffin plates.',
      tags: ['Scoop & Tear', 'Dosas & Tiffin', 'Tandoor & Wraps'],
    },
  },
  {
    key: 'flavourProfile',
    eyebrow: 'Round 2 of 5 - Flavour Axis',
    prompt: 'Which flavour direction pulls harder?',
    optionA: {
      value: 'spicy_tangy',
      title: 'Sharp, Spicy, Tangy & Chatpata',
      subtitle: 'Cracked black pepper, green chilli, tamarind tang, smoky tandoor masala, or lime zing.',
      tags: ['Pepper & Chilli', 'Tangy & Chatpata', 'Smoky Spice'],
    },
    optionB: {
      value: 'rich_creamy_umami',
      title: 'Rich, Creamy, Buttery & Umami',
      subtitle: 'Slow-simmered dals, coconut stews, butter-cashew sauces, roasted sesame, or mellow comfort.',
      tags: ['Silky & Velvety', 'Ghee & Coconut', 'Deep Umami'],
    },
  },
  {
    key: 'textureVibe',
    eyebrow: 'Round 3 of 5 - Texture & Body',
    prompt: 'What mouthfeel are you craving?',
    optionA: {
      value: 'crispy_charred_dry',
      title: 'Crispy, Charred & Dry-Roast',
      subtitle: 'Griddled edges, tandoor char, wok-seared dry toss, or nutty toasted textures.',
      tags: ['Crisp & Griddled', 'Tandoor Char', 'Wok-Seared'],
    },
    optionB: {
      value: 'saucy_gravy_soupy',
      title: 'Saucy, Gravy-Led, Stewed or Soupy',
      subtitle: 'Rich curries for mopping, velvety broths, coconut stews, or comforting saucy bowls.',
      tags: ['Gravy & Curry', 'Broth & Stew', 'Velvety Sauce'],
    },
  },
  {
    key: 'culinarySoul',
    eyebrow: 'Round 4 of 5 - Culinary Soul',
    prompt: 'Where should the kitchen take you?',
    optionA: {
      value: 'indian_regional',
      title: 'Indian Regional & Subcontinental Classics',
      subtitle: 'South Indian tiffin, North Indian tandoor, coastal ghee roasts, biryani, or ghar-ka-tadka.',
      tags: ['Tiffin & Regional', 'Dhaba & Tandoor', 'Biryani & Comfort'],
    },
    optionB: {
      value: 'asian_global',
      title: 'Pan-Asian, Desi Chinese & Global Comfort',
      subtitle: 'Burmese broths, fiery wok noodles, Thai curries, Mexican bowls, pita mezze, or artisanal pasta.',
      tags: ['Desi Chinese & Thai', 'Burmese & Ramen', 'Mezze & Bowls'],
    },
  },
];

/**
 * Hard-filters dishes by dietary rules and optional travel-safe constraint.
 */
export function getDietCompliantPool(dishes, filters) {
  const diet = filters?.diet || 'veg';
  const travelSafeOnly = Boolean(filters?.travelSafeOnly);

  let pool = dishes.filter((dish) => {
    const diets = dish.supportedDiets || [];
    if (diet === 'jain') {
      return diets.includes('jain');
    }
    if (diet === 'veg') {
      return diets.includes('veg');
    }
    if (diet === 'egg') {
      return diets.includes('egg') || diets.includes('veg');
    }
    // non-veg
    return diets.includes('non-veg') || diets.includes('egg');
  });

  if (travelSafeOnly) {
    pool = pool.filter((dish) => dish.metrics?.travelSafe === true);
  }

  // Defensive fallback only if an unexpected empty dataset occurs
  if (pool.length < 2 && diet === 'non-veg') {
    const extras = dishes.filter(
      (d) => !pool.some((p) => p.id === d.id) && (!travelSafeOnly || d.metrics?.travelSafe === true)
    );
    pool = pool.concat(extras);
  }

  return pool;
}

/**
 * Scores and ranks all compliant dishes deterministically.
 */
export function scoreAndRankDishes(dishes, filters, choices = {}, recentHistoryIds = []) {
  const pool = getDietCompliantPool(dishes, filters);
  const recentSet = new Set(recentHistoryIds);

  const heavinessLabel =
    HEAVINESS_OPTIONS.find((h) => h.id === filters?.heaviness)?.label || filters?.heaviness;

  const scored = pool.map((dish) => {
    let score = 0;
    const matchReasons = [];

    // Heaviness alignment
    if (filters?.heaviness && dish.heaviness.includes(filters.heaviness)) {
      score += 5;
      matchReasons.push(`Matches ${heavinessLabel}`);
    }

    // High-Protein preference
    if (filters?.highProtein) {
      const protein = dish.metrics?.proteinGrams || 0;
      if (protein >= 24) {
        score += 6;
        matchReasons.push(`${protein}g High-Protein Pick`);
      } else if (protein >= 18) {
        score += 2;
      } else {
        score -= 3;
      }
    }

    // Diet specificity weighting
    if (filters?.diet === 'egg') {
      if (dish.supportedDiets.includes('egg') && !dish.supportedDiets.includes('veg')) {
        score += 4;
        matchReasons.push('Dedicated Egg Highlight');
      }
    } else if (filters?.diet === 'non-veg') {
      if (dish.supportedDiets.includes('non-veg') && !dish.supportedDiets.includes('egg')) {
        score += 5;
      } else if (dish.supportedDiets.includes('non-veg')) {
        score += 4;
      }
    }

    // Sensory choices from Rounds 1 to 4
    for (const round of SENSORY_ROUNDS) {
      const chosenVal = choices[round.key];
      if (chosenVal && dish.sensory[round.key] === chosenVal) {
        score += 4;
        const opt =
          round.optionA.value === chosenVal ? round.optionA.title : round.optionB.title;
        matchReasons.push(opt);
      }
    }

    // 72-Hour Repeat Avoidance Penalty
    const isRecent = recentSet.has(dish.id);
    if (isRecent) {
      score -= 8;
    }

    return {
      dish,
      score,
      isRecent,
      matchReasons,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isRecent !== b.isRecent) return a.isRecent ? 1 : -1;
    if (filters?.highProtein && b.dish.metrics.proteinGrams !== a.dish.metrics.proteinGrams) {
      return b.dish.metrics.proteinGrams - a.dish.metrics.proteinGrams;
    }
    if (a.dish.metrics.travelSafe !== b.dish.metrics.travelSafe) {
      return a.dish.metrics.travelSafe ? -1 : 1;
    }
    return a.dish.id.localeCompare(b.dish.id);
  });

  return scored;
}

/**
 * Picks up to 3 diet-compliant example dish names for a sensory option card.
 * Prefers dishes matching earlier round choices first, then tops up from the
 * overall ranked compliant pool matching this sensory trait.
 */
function pickCardExamples(rankedPool, sensoryKey, sensoryValue, priorChoices) {
  const priorEntries = Object.entries(priorChoices || {}).filter(([, val]) => Boolean(val));

  const strictMatches = rankedPool.filter(
    (entry) =>
      entry.dish.sensory[sensoryKey] === sensoryValue &&
      priorEntries.every(([k, v]) => entry.dish.sensory[k] === v)
  );

  const broadMatches = rankedPool.filter(
    (entry) => entry.dish.sensory[sensoryKey] === sensoryValue
  );

  const combined = [...strictMatches];
  for (const candidate of broadMatches) {
    if (!combined.some((item) => item.dish.id === candidate.dish.id)) {
      combined.push(candidate);
    }
    if (combined.length >= 3) break;
  }

  return combined.slice(0, 3).map((entry) => entry.dish.name);
}

/**
 * Builds the UI payload for any round index (0..3 sensory funnel, 4 final dish showdown).
 */
export function getRoundOptions(roundIndex, dishes, filters, currentChoices = {}, recentHistoryIds = []) {
  const ranked = scoreAndRankDishes(dishes, filters, currentChoices, recentHistoryIds);

  if (roundIndex >= 0 && roundIndex < SENSORY_ROUNDS.length) {
    const round = SENSORY_ROUNDS[roundIndex];
    const priorChoices = {};
    for (let i = 0; i < roundIndex; i += 1) {
      const k = SENSORY_ROUNDS[i].key;
      if (currentChoices[k]) {
        priorChoices[k] = currentChoices[k];
      }
    }

    return {
      roundType: 'sensory',
      roundIndex,
      key: round.key,
      eyebrow: round.eyebrow,
      prompt: round.prompt,
      optionA: {
        ...round.optionA,
        examples: pickCardExamples(ranked, round.key, round.optionA.value, priorChoices),
      },
      optionB: {
        ...round.optionB,
        examples: pickCardExamples(ranked, round.key, round.optionB.value, priorChoices),
      },
    };
  }

  // Round 5 (index 4): Final Head-to-Head Showdown between #1 and #2 matching dishes
  const finalistA = ranked[0];
  const finalistB = ranked[1];

  return {
    roundType: 'showdown',
    roundIndex: 4,
    key: 'finalShowdown',
    eyebrow: 'Round 5 of 5 - Final Head-to-Head Showdown',
    prompt: "Two top dishes survived your craving filter. Pick tonight's winner.",
    optionA: finalistA
      ? {
          value: finalistA.dish.id,
          dish: finalistA.dish,
          score: finalistA.score,
          isRecent: finalistA.isRecent,
          matchReasons: finalistA.matchReasons,
        }
      : null,
    optionB: finalistB
      ? {
          value: finalistB.dish.id,
          dish: finalistB.dish,
          score: finalistB.score,
          isRecent: finalistB.isRecent,
          matchReasons: finalistB.matchReasons,
        }
      : null,
    rankedPool: ranked,
  };
}

/**
 * Builds final ordered candidates after Round 5 choice:
 * selected winner first, followed by the showdown runner-up and next closest matches.
 */
export function resolveWinnerAndRunnersUp(winnerId, dishes, filters, choices, recentHistoryIds = []) {
  const ranked = scoreAndRankDishes(dishes, filters, choices, recentHistoryIds);
  const winnerEntry = ranked.find((item) => item.dish.id === winnerId) || ranked[0];
  const runnersUp = ranked.filter((item) => item.dish.id !== winnerEntry?.dish.id).slice(0, 4);

  return {
    winner: winnerEntry,
    runnersUp,
    allRanked: ranked,
  };
}
