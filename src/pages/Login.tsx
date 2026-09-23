import { useAuth } from '../store/AuthContext';
import { BookOpen, GraduationCap } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const Login = () => {
  const { signInWithGoogle, currentUser } = useAuth();

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      alert("Failed to log in. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-blue-600">
          <BookOpen size={48} />
          <GraduationCap size={48} className="-ml-4 mt-4" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Class Tracker
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in to access your classes and sync across devices
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <button
            onClick={handleLogin}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Sign in with Google
          </button>
          
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Secure & Private</span>
              </div>
            </div>
            
            <p className="mt-6 text-center text-xs text-gray-500">
              Your data is completely private and securely stored in your own Google Firebase database.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
