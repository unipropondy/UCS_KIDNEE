const { poolPromise } = require("c:\\Users\\UNIPRO\\Desktop\\kindee\\backend\\config\\db");
const sql = require("mssql");

async function checkPrinters() {
  try {
    const pool = await poolPromise;
    console.log("=== CategoryMaster (active) ===");
    const cats = await pool.request().query(`
      SELECT CategoryId, CategoryName, IsActive 
      FROM CategoryMaster 
      WHERE CategoryName LIKE '%Beverage%'
    `);
    console.dir(cats.recordset);

    console.log("\n=== CategoryKitchenType ===");
    const ckt = await pool.request().query(`
      SELECT CategoryId, KitchenTypeCode, KitchenTypeName 
      FROM CategoryKitchenType 
      WHERE KitchenTypeName LIKE '%Beverage%'
    `);
    console.dir(ckt.recordset);

    console.log("\n=== PrintMaster (type 2) ===");
    const pm = await pool.request().query(`
      SELECT PrinterId, PrinterName, PrinterPath, KitchenTypeName, KitchenTypeValue, IsActive 
      FROM PrintMaster 
      WHERE KitchenTypeName LIKE '%Beverage%'
    `);
    console.dir(pm.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkPrinters();
