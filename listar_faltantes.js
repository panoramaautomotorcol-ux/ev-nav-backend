// Genera las líneas de VEHICLE_PROFILES para los vehículos que están en el app y no en el backend
const fs = require('fs');
const app = fs.readFileSync('../wattgoev-app/lib/src/ui/navigation_screen.dart', 'utf8');
const server = fs.readFileSync('server.cjs', 'utf8');
const re = /id:\s*'([^']+)'[\s\S]*?batteryKwh:\s*([\d.]+)[\s\S]*?consumptionRate:\s*([\d.]+)/g;
let m;
while ((m = re.exec(app))) {
  if (!server.includes(`'${m[1]}':`)) {
    console.log(`  '${m[1]}': { batteryKwh: ${m[2]}, consumptionRate: ${m[3]} },`);
  }
}