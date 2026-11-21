import assert from 'node:assert/strict';
import { DISHES } from '../src/data/dishes.js';
import {
  DIET_OPTIONS,
  HEAVINESS_OPTIONS,
  SENSORY_ROUNDS,
  getDietCompliantPool,
  getRoundOptions,
  resolveWinnerAndRunnersUp,
  scoreAndRankDishes,
} from '../src/engine/decisionEngine.js';

const dishByName = new Map(DISHES.map((d) => [d.name, d]));

function verifyDishCatalogIntegrity() {
  assert.ok(DISHES.length >= 80, `Expected at least 80 dishes, got ${DISHES.length}`);
  const ids = new Set();
  for (const dish of DISHES) {
    assert.ok(!ids.has(dish.id), `Duplicate dish id: ${dish.id}`);
    ids.add(dish.id);
    if (dish.supportedDiets.includes('jain')) {
      assert.ok(
        dish.supportedDiets.includes('veg'),
        `Jain dish ${dish.id} must also include 'veg' in supportedDiets`
      );
      assert.ok(
        typeof dish.jainNote === 'string' && dish.jainNote.length > 5,
        `Jain dish ${dish.id} should include a clear jainNote`
      );
    }
    const serialized = JSON.stringify(dish);
    assert.ok(!serialized.includes('\u2014'), `Found forbidden em dash in dish ${dish.id}`);
  }
}

function assertDishCompliance(dish, filters, contextLabel) {
  assert.ok(dish, `Missing dish in ${contextLabel}`);
  if (filters.diet === 'jain') {
    assert.ok(
      dish.supportedDiets.includes('jain'),
      `[JAIN LEAK] ${dish.id} appeared in ${contextLabel}`
    );
  } else if (filters.diet === 'veg') {
    assert.ok(
      dish.supportedDiets.includes('veg'),
      `[VEG LEAK] ${dish.id} appeared in ${contextLabel}`
    );
  } else if (filters.diet === 'egg') {
    assert.ok(
      dish.supportedDiets.includes('egg') || dish.supportedDiets.includes('veg'),
      `[EGG LEAK] ${dish.id} appeared in ${contextLabel}`
    );
  }

  if (filters.travelSafeOnly) {
    assert.ok(
      dish.metrics.travelSafe === true,
      `[TRAVEL-SAFE LEAK] ${dish.id} (travelSafe=false) appeared in ${contextLabel}`
    );
  }
}

function verifyAll1024Permutations() {
  let permutationCount = 0;
  let exampleChecks = 0;

  for (const dietOpt of DIET_OPTIONS) {
    for (const heavinessOpt of HEAVINESS_OPTIONS) {
      for (const highProtein of [false, true]) {
        for (const travelSafeOnly of [false, true]) {
          const filters = {
            diet: dietOpt.id,
            heaviness: heavinessOpt.id,
            highProtein,
            travelSafeOnly,
          };

          const pool = getDietCompliantPool(DISHES, filters);
          assert.ok(
            pool.length >= 2,
            `Pool under ${JSON.stringify(filters)} had < 2 dishes (${pool.length})`
          );

          // 16 sensory paths (2^4)
          for (let mask = 0; mask < 16; mask += 1) {
            permutationCount += 1;
            const choices = {};

            for (let r = 0; r < 4; r += 1) {
              const roundPayload = getRoundOptions(r, DISHES, filters, choices, []);
              assert.equal(roundPayload.roundType, 'sensory');
              assert.ok(
                roundPayload.optionA.examples.length > 0 &&
                  roundPayload.optionB.examples.length > 0,
                `Empty example preview at round ${r + 1} for ${JSON.stringify(filters)}`
              );

              for (const exName of [
                ...roundPayload.optionA.examples,
                ...roundPayload.optionB.examples,
              ]) {
                const exDish = dishByName.get(exName);
                assertDishCompliance(exDish, filters, `Round ${r + 1} preview (${exName})`);
                exampleChecks += 1;
              }

              const pickA = (mask & (1 << r)) === 0;
              choices[SENSORY_ROUNDS[r].key] = pickA
                ? roundPayload.optionA.value
                : roundPayload.optionB.value;
            }

            // Round 5 Showdown
            const showdown = getRoundOptions(4, DISHES, filters, choices, []);
            assert.equal(showdown.roundType, 'showdown');
            assert.ok(
              showdown.optionA && showdown.optionB,
              `Round 5 missing finalists for ${JSON.stringify(filters)} mask=${mask}`
            );
            assert.notEqual(
              showdown.optionA.dish.id,
              showdown.optionB.dish.id,
              `Round 5 finalists are identical for ${JSON.stringify(filters)} mask=${mask}`
            );

            assertDishCompliance(showdown.optionA.dish, filters, `Round 5 Option A`);
            assertDishCompliance(showdown.optionB.dish, filters, `Round 5 Option B`);

            const resolved = resolveWinnerAndRunnersUp(
              showdown.optionA.dish.id,
              DISHES,
              filters,
              choices,
              []
            );
            assert.ok(resolved.winner, 'Winner missing');
            assert.ok(resolved.runnersUp.length >= 1, 'Runners-up missing');
            for (const runner of resolved.runnersUp) {
              assertDishCompliance(runner.dish, filters, `Runner-up`);
            }
          }
        }
      }
    }
  }

  return { permutationCount, exampleChecks };
}

function verifyCooldownPenalty() {
  const filters = {
    diet: 'veg',
    heaviness: 'balanced',
    highProtein: true,
    travelSafeOnly: true,
  };
  const choices = {
    baseFormat: 'bread_dosa_wrap',
    flavourProfile: 'spicy_tangy',
    textureVibe: 'crispy_charred_dry',
    culinarySoul: 'indian_regional',
  };

  const firstRun = scoreAndRankDishes(DISHES, filters, choices, []);
  const topWinnerId = firstRun[0].dish.id;
  const secondRun = scoreAndRankDishes(DISHES, filters, choices, [topWinnerId]);
  const penalizedEntry = secondRun.find((e) => e.dish.id === topWinnerId);

  assert.equal(penalizedEntry.isRecent, true);
  assert.equal(penalizedEntry.score, firstRun[0].score - 8);
  assert.notEqual(
    secondRun[0].dish.id,
    topWinnerId,
    `Expected top winner ${topWinnerId} to rotate out after 72-hour cooldown lock-in`
  );
}

verifyDishCatalogIntegrity();
const stats = verifyAll1024Permutations();
verifyCooldownPenalty();

console.log(
  `PASS: Catalog (${DISHES.length} dishes) verified. ${stats.permutationCount}/1024 permutations passed with ${stats.exampleChecks} compliant preview checks and cooldown rotation verified.`
);
