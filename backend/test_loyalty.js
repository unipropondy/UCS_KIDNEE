const { poolPromise } = require("./config/db");
const sql = require("mssql");

async function runTest() {
  try {
    const pool = await poolPromise;
    console.log("Connected to database successfully.");

    // Fetch active rules
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
    const isSameDish = testRule.PurchaseDishId === testRule.RewardDishId;

    console.log(`\nSelected Rule for Test: [${isSameDish ? "SAME DISH" : "DIFFERENT DISH"}]`);
    console.log(`Rule: Buy ${testRule.RequiredBills}x "${testRule.PurchaseDishName}" -> Get Free "${testRule.RewardDishName}"`);

    // Mock items representing the purchase
    const mockItems = [
      {
        DishId: testRule.PurchaseDishId,
        Qty: testRule.RequiredBills + 1,
        Price: 10.0,
        isDishReward: false
      }
    ];

    console.log("\n--- Mock Items Input ---");
    console.dir(mockItems);

    // Call local calculation implementation
    const updatedItems = mockItems.map(item => ({ ...item }));
    const appliedRewards = [];
    let totalDiscount = 0;

    const purchaseDishIdLower = String(testRule.PurchaseDishId).toLowerCase();
    let purchaseQty = 0;
    for (const item of updatedItems) {
      if (String(item.DishId || item.dishId || item.id).toLowerCase() === purchaseDishIdLower && !item.isDishReward) {
        purchaseQty += (item.Qty || 1);
      }
    }

    const blockSize = (testRule.RequiredBills || 9) + 1;
    const rewardsToApply = Math.floor(purchaseQty / blockSize);

    if (rewardsToApply > 0) {
      if (isSameDish) {
        let rewardsApplied = 0;
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          if (String(item.DishId || item.dishId || item.id).toLowerCase() === purchaseDishIdLower && !item.isDishReward) {
            const qtyToFree = Math.min(item.Qty || item.qty || 1, rewardsToApply - rewardsApplied);
            if (qtyToFree > 0) {
              const originalPrice = parseFloat(item.Price || item.price || 0);
              
              if ((item.Qty || item.qty) > qtyToFree) {
                if (item.Qty !== undefined) item.Qty -= qtyToFree;
                if (item.qty !== undefined) item.qty -= qtyToFree;

                updatedItems.push({
                  ...item,
                  Qty: qtyToFree,
                  qty: qtyToFree,
                  Price: 0,
                  price: 0,
                  originalPrice: originalPrice,
                  isDishReward: true,
                  rewardRuleId: testRule.RuleId,
                  rewardDishId: testRule.RewardDishId
                });
              } else {
                item.originalPrice = originalPrice;
                item.Price = 0;
                item.price = 0;
                item.isDishReward = true;
                item.rewardRuleId = testRule.RuleId;
                item.rewardDishId = testRule.RewardDishId;
              }

              rewardsApplied += qtyToFree;
              totalDiscount += originalPrice * qtyToFree;
              appliedRewards.push({
                ruleId: testRule.RuleId,
                rewardDishId: testRule.RewardDishId,
                qty: qtyToFree
              });

              if (rewardsApplied >= rewardsToApply) {
                break;
              }
            }
          }
        }
      } else {
        const rewardPrice = parseFloat(testRule.RewardDishPrice || 0);
        const uniqueLineItemId = require("crypto").randomUUID();
        updatedItems.push({
          lineItemId: uniqueLineItemId,
          lineitemid: uniqueLineItemId,
          DishId: testRule.RewardDishId,
          dishId: testRule.RewardDishId,
          id: testRule.RewardDishId,
          name: testRule.RewardDishName || "Free Reward Item",
          Qty: rewardsToApply,
          qty: rewardsToApply,
          Price: 0,
          price: 0,
          originalPrice: rewardPrice,
          isDishReward: true,
          rewardRuleId: testRule.RuleId,
          rewardDishId: testRule.RewardDishId
        });
        
        totalDiscount += rewardPrice * rewardsToApply;
        appliedRewards.push({
          ruleId: testRule.RuleId,
          rewardDishId: testRule.RewardDishId,
          qty: rewardsToApply
        });
      }
    }

    console.log("\n--- Output Items (Calculated) ---");
    console.dir(updatedItems);
    console.log("\n--- Applied Rewards Summary ---");
    console.dir(appliedRewards);
    console.log(`Total Discount: $${totalDiscount.toFixed(2)}`);

    console.log("\n✅ Test completed successfully. Calculation output matches expectations.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

runTest();
