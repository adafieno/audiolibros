import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to Khipu Cloud</h1>
        <p className="mt-4 text-gray-600">Your audiobook production workspace</p>
        <div className="mt-8">
          <a href="/login" className="text-primary-600 hover:text-primary-700 underline">
            Go to Login
          </a>
        </div>
      </div>
    </div>
  );
}
