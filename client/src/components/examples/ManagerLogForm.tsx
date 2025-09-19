import ManagerLogForm from '../ManagerLogForm';

export default function ManagerLogFormExample() {
  const handleSubmit = (data: any) => {
    console.log('Form submitted with data:', data);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <ManagerLogForm onSubmit={handleSubmit} />
    </div>
  );
}