import { migrateSpecificResellers } from "./lib/manual-migration.server";

migrateSpecificResellers().then(() => {
  console.log("DONE");
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
