const { poolPromise } = require("./config/db");
const sql = require("mssql");

async function runTest() {
  try {
    const pool = await poolPromise;
    console.log("Connected to database successfully.");

    // Fetch active rules (including currentcost as RewardDishPrice)
    const rulesRes = await pool.request().query(`
      SELECT r.RuleId, r.PurchaseDishId, r.RewardDishId, r.RequiredBills,
             d.Name AS RewardDishName, d.currentcost AS RewardDishPrice,
             p.Name AS PurchaseDishName
      FROM LoyaltyRule r
      INNER JOIN LoyaltyCampaign c ON r.CampaignId = c.CampaignId
      LEFT JOIN DishMaster d ON r.RewardDishId = d.DishId
      LEFT JOIN DishMaster p ON r.PurchaseDishId = p.DishId
      WHERE r.IsActive = 1 AND c.IsActive = 1
        AND GETDATE() BETWEEN c.StartDate AND c.EndDate
    `);

    const activeRules = rulesRes.recordset || [];
    console.log("\n=== Active Loyalty Rules ===");
    console.dir(activeRules);

    if (activeRules.length === 0) {
      console.log("❌ No active loyalty rules found in DB!");
      process.exit(0);
    }

    const testRule = activeRules.find(r => r.PurchaseDishId !== r.RewardDishId) || activeRules[0];
    console.log(`\nSelected Rule for Test: Buy ${testRule.RequiredBills}x "${testRule.PurchaseDishName}" -> Get Free "${testRule.RewardDishName}"`);

    // Mock items representing:
    // 1. Buying enough of the Purchase Dish (e.g. 4x of 100 Plus)
    // 2. ALSO manually adding the Reward Dish to the cart (e.g. 1x Alcoholic Ice Cream)
    const mockItems = [
      {
        DishId: testRule.PurchaseDishId,
        Qty: testRule.RequiredBills + 1, // e.g. 4
        Price: 2.0,
        isDishReward: false
      },
      {
        DishId: testRule.RewardDishId,
        Qty: 1,
        Price: 10.9,
        isDishReward: false
      }
    ];

    console.log("\n--- Mock Items Input (Cart) ---");
    console.dir(mockItems);

    // Run the user's updated loyalty logic
    const updatedItems = mockItems.map(item => ({ ...item }));
    const appliedRewards = [];
    let totalDiscount = 0;

    // Simulate ruleRewardsAvailableMap (start with 0 rewards available)
    const ruleCurrentCountMap = { [testRule.RuleId]: 0 };
    const ruleRewardsAvailableMap = { [testRule.RuleId]: 0 };

    for (const rule of activeRules) {
      const purchaseDishIdLower = String(rule.PurchaseDishId).toLowerCase();
      const rewardDishIdLower = String(rule.RewardDishId || "").toLowerCase();

      // Calculate total quantity of this dish being purchased
      let purchaseQty = 0;
      for (const item of updatedItems) {
        if (String(item.DishId || item.dishId || item.id).toLowerCase() === purchaseDishIdLower && !item.isDishReward) {
          purchaseQty += (item.Qty || 1);
        }
      }

      // Check how many of the reward dish are present in the cart
      let availableRewardDishQty = 0;
      for (const item of updatedItems) {
        if (String(item.DishId || item.dishId || item.id).toLowerCase() === rewardDishIdLower && !item.isDishReward) {
          availableRewardDishQty += (item.Qty || 1);
        }
      }

      const storedRewards = ruleRewardsAvailableMap[rule.RuleId] || 0;
      const currentBalance = ruleCurrentCountMap[rule.RuleId] || 0;
      const totalAccumulated = currentBalance + purchaseQty;
      const blockSize = (rule.RequiredBills || 9) + 1;
      const newRewardsEarned = Math.floor(totalAccumulated / blockSize);

      const totalRewardsToApply = storedRewards + newRewardsEarned;

      console.log(`\nRule: ${rule.PurchaseDishName} -> ${rule.RewardDishName}`);
      console.log(`Purchase Qty: ${purchaseQty}, Stored Rewards: ${storedRewards}, New Rewards Earned: ${newRewardsEarned}`);
      console.log(`Total Rewards to Apply: ${totalRewardsToApply}, Available Reward Dish Qty in Cart: ${availableRewardDishQty}`);

      if (totalRewardsToApply <= 0) continue;

      const rewardsForThisBill = Math.min(totalRewardsToApply, availableRewardDishQty);
      console.log(`Rewards For This Bill: ${rewardsForThisBill}`);
      if (rewardsForThisBill <= 0) continue;

      let rewardsApplied = 0;
      for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        if (String(item.DishId || item.dishId || item.id).toLowerCase() === rewardDishIdLower && !item.isDishReward) {
          const qtyToFree = Math.min(item.Qty || 1, rewardsForThisBill - rewardsApplied);
          if (qtyToFree > 0) {
            const originalPrice = parseFloat(item.Price || item.price || 0);
            const crypto = require("crypto");
            
            if (item.Qty > qtyToFree) {
              item.Qty = item.Qty - qtyToFree;
              if (item.qty !== undefined) item.qty = item.Qty;

              updatedItems.push({
                ...item,
                lineItemId: crypto.randomUUID(),
                Qty: qtyToFree,
                qty: qtyToFree,
                Price: 0,
                price: 0,
                originalPrice: originalPrice,
                isDishReward: true,
                rewardRuleId: rule.RuleId,
                rewardDishId: rule.RewardDishId
              });
            } else {
              item.originalPrice = originalPrice;
              item.Price = 0;
              item.price = 0;
              item.isDishReward = true;
              item.rewardRuleId = rule.RuleId;
              item.rewardDishId = rule.RewardDishId;
            }

            rewardsApplied += qtyToFree;
            totalDiscount += originalPrice * qtyToFree;
            appliedRewards.push({
              ruleId: rule.RuleId,
              rewardDishId: rule.RewardDishId,
              qty: qtyToFree
            });

            if (rewardsApplied >= rewardsForThisBill) {
              break;
            }
          }
        }
      }
    }

    console.log("\n--- Output Items (Calculated) ---");
    console.dir(updatedItems);
    console.log("\n--- Applied Rewards Summary ---");
    console.dir(appliedRewards);
    console.log(`Total Discount: $${totalDiscount.toFixed(2)}`);

    console.log("\n✅ Test completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

runTest();
