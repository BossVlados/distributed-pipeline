'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/utils/api';
import { Task } from '@/types/task';
import io from 'socket.io-client';
import Link from 'next/link';

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchTasks();

    // Подключаем WebSocket
    const socket = io(process.env.NEXT_PUBLIC_WS_URL as string, {
      transports: ['websocket'],
    });
    socket.on('connect', () => console.log('WS connected'));
    socket.on('taskUpdated', (updatedTask: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [router]);

  const fetchTasks = async () => {
    try {
      const res = await api.get('/tasks');
      setTasks(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/upload', formData);
      // Добавляем новую задачу в список вручную (или дождёмся WebSocket)
      const newTask = { ...res.data, status: 'pending', original_filename: file.name };
      setTasks((prev) => [newTask as Task, ...prev]);
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'processing': case 'parsing': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  if (loading) return <div className="p-8">Loading tasks...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">File Processing Pipeline</h1>
        <button
          onClick={() => {
            localStorage.removeItem('token');
            router.push('/login');
          }}
          className="px-4 py-2 bg-gray-200 rounded"
        >
          Logout
        </button>
      </div>

      <div className="mb-8 p-4 border-2 border-dashed border-gray-300 rounded text-center">
        <input
          type="file"
          accept=".csv,.json,.xlsx,.txt"
          onChange={handleFileUpload}
          className="hidden"
          id="fileUpload"
        />
        <label htmlFor="fileUpload" className="cursor-pointer inline-block px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700">
          Upload CSV / JSON / TXT
        </label>
        <p className="text-sm text-gray-500 mt-2">Supported: CSV, JSON, XLSX, TXT (max 100MB)</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr>
              <th className="px-6 py-3 border-b">ID</th>
              <th className="px-6 py-3 border-b">Filename</th>
              <th className="px-6 py-3 border-b">Status</th>
              <th className="px-6 py-3 border-b">Created</th>
              <th className="px-6 py-3 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 border-b">{task.id}</td>
                <td className="px-6 py-4 border-b">{task.original_filename}</td>
                <td className={`px-6 py-4 border-b font-medium ${getStatusColor(task.status)}`}>
                  {task.status}
                </td>
                <td className="px-6 py-4 border-b">{new Date(task.created_at).toLocaleString()}</td>
                <td className="px-6 py-4 border-b">
                  <Link href={`/task/${task.id}`} className="text-blue-600 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">No tasks yet. Upload a file to start.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
