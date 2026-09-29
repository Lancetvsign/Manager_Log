import { useState } from 'react';
import SalesInput from '../SalesInput';

export default function SalesInputExample() {
  const [salesData, setSalesData] = useState({
    current: { food: "2850.00", bar: "1200.00", gaming: "350.00", catering: "250.00" },
    lastYear: { food: "2650.00", bar: "1100.00", gaming: "320.00", catering: "200.00" }
  });

  const handleSalesChange = (field: string, value: string) => {
    setSalesData(prev => ({
      ...prev,
      current: { ...prev.current, [field]: value }
    }));
  };

  return (
    <div className="p-4">
      <SalesInput
        title="Daily Sales"
        salesData={salesData}
        onSalesChange={handleSalesChange}
        showComparison={true}
      />
    </div>
  );
}