/**
 * APPLICATION ENTRY POINT
 * =======================
 * This is the main entry point for the Restaurant Manager's Log application.
 * For development, it uses a default clubId. In production when embedded
 * in Social Club Pro, use ManagerLogModule directly with the real clubId.
 * 
 * STANDALONE MODE (Development):
 * - Uses "default" as clubId
 * - Runs on its own with full functionality
 * 
 * EMBEDDED MODE (Social Club Pro):
 * - Import ManagerLogModule from './ManagerLogModule'
 * - Pass clubId, clubName, managerName, apiBaseUrl from parent app
 */

import { ManagerLogModule } from "./ManagerLogModule";

function App() {
  return (
    <ManagerLogModule
      clubId="default"
      clubName="Development Mode"
      apiBaseUrl=""
    />
  );
}

export default App;
