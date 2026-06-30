const { poolPromise } = require("./config/db");
const sql = require("mssql");

async function checkBeerSC() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT DishId, Name, isServiceCharge 
      FROM DishMaster 
      WHERE Name LIKE '%Chang Beer%'
    `);
    console.log("Beer dish settings:");
    console.dir(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkBeerSC();
