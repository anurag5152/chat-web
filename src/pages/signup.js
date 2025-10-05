import React from 'react';
import { useNavigate } from 'react-router-dom';
export default function Signup() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl shadow-xl border border-white/60">
                <div className="p-6 sm:p-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">Create your account</h1>
                    <p className="mt-2 text-center text-gray-500">Join us and get started in seconds</p>

                    <form action="/signup" method="post" className="mt-8 space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Name</label>
                            <input name="name" type="text" required className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" placeholder="Your name" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input name="email" type="email" required className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" placeholder="you@example.com" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Password</label>
                            <input name="password" type="password" required className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" placeholder="••••••••" />
                        </div>

                        <button type="submit" className="w-full inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-white font-medium shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition">
                            Sign up
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-600">
                        Already have an account?{' '}
                        <a href="#" onClick={(e) => { e.preventDefault(); navigate('/login'); }} className="font-medium text-indigo-600 hover:text-indigo-700">
                            Log in
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}