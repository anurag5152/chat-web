// src/pages/SignupPage.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signup } from "../utils/api";

export default function SignupPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await signup(formData);
      localStorage.setItem("user", JSON.stringify(res));
      navigate("/chat");
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/2 flex flex-col justify-center items-center bg-blue-600 text-white p-10">
        <h1 className="text-5xl font-bold mb-6">ChatConnect</h1>
        <p className="text-lg text-center">Create your account and start chatting instantly.</p>
      </div>

      <div className="w-1/2 flex flex-col justify-center items-center bg-white shadow-lg">
        <h2 className="text-3xl font-bold mb-6">Sign Up</h2>
        <form className="w-2/3" onSubmit={handleSubmit}>
          <input
            name="username"
            type="text"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            className="w-full mb-4 p-3 border rounded-lg"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full mb-4 p-3 border rounded-lg"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            className="w-full mb-6 p-3 border rounded-lg"
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg">
            Sign Up
          </button>
        </form>
        {error && <p className="text-red-600 mt-2">{error}</p>}
        <p className="mt-4 text-gray-600">
          Already have an account?{" "}
          <span onClick={() => navigate("/")} className="text-blue-600 cursor-pointer">
            Login
          </span>
        </p>
      </div>
    </div>
  );
}
