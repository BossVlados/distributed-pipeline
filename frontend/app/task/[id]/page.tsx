'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/utils/api';
import { Task } from '@/types/task';

export default function TaskDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchTask();
  }, [id]);

  const fetchTask = async () => {
    try {
      const res = await api.get(`/tasks/${id}`);
      setTask(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!task) return <div className="p-8">Task not found</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button onClick={() => router.back()} className="mb-4 text-blue-600 hover:underline">
        ← Back
      </button>
      <h1 className="text-2xl font-bold mb-4">Task #{task.id}</h1>
      <div className="bg-white shadow rounded p-6 space-y-4">
        <div>
          <strong>Filename:</strong> {task.original_filename}
        </div>
        <div>
          <strong>Status:</strong>{' '}
          <span className={`font-medium ${
            task.status === 'completed' ? 'text-green-600' : 
            task.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
          }`}>
            {task.status}
          </span>
        </div>
        <div>
          <strong>Created:</strong> {new Date(task.created_at).toLocaleString()}
        </div>
        <div>
          <strong>Last Updated:</strong> {new Date(task.updated_at).toLocaleString()}
        </div>
        {task.error_message && (
          <div className="bg-red-50 p-4 rounded">
            <strong className="text-red-700">Error:</strong> {task.error_message}
          </div>
        )}
        {task.result && (
          <div>
            <strong>Analysis Result:</strong>
            <pre className="bg-gray-100 p-4 rounded mt-2 overflow-auto text-sm">
              {JSON.stringify(task.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
