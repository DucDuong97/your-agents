import React from 'react';
import { useForm } from 'react-hook-form';

interface UserInfoModalProps {
  onSubmit: (data: { userNickname: string; userJobTitle: string }) => void;
  onClose?: () => void;
  initialValues?: {
    userNickname?: string;
    userJobTitle?: string;
  };
}

interface UserInfoFormValues {
  userNickname: string;
  userJobTitle: string;
}

export default function UserInfoModal({ 
  onSubmit,
  initialValues = {} 
}: UserInfoModalProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<UserInfoFormValues>({
    defaultValues: {
      userNickname: initialValues.userNickname || '',
      userJobTitle: initialValues.userJobTitle || '',
    }
  });
  
  const onFormSubmit = (data: UserInfoFormValues) => {
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Welcome! Tell us about yourself
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            This information will be used to personalize your experience
          </p>
        </div>
        
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Your Nickname
              </label>
              <input
                {...register('userNickname', { required: 'Nickname is required' })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="What should we call you?"
              />
              {errors.userNickname && (
                <p className="mt-1 text-sm text-red-600">{errors.userNickname.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Your Job Title
              </label>
              <input
                {...register('userJobTitle', { required: 'Job title is required' })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Software Engineer, Designer, etc."
              />
              {errors.userJobTitle && (
                <p className="mt-1 text-sm text-red-600">{errors.userJobTitle.message}</p>
              )}
            </div>
          </div>
          
          <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 