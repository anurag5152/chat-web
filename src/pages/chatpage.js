import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';


// Initialize socket outside of the component to prevent re-creation on re-renders.
const socket = io('http://localhost:5000', { withCredentials: true, autoConnect: false });

const Chatpage = () => {
  // State for managing component data
  const [currentUser, setCurrentUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);

  // Helper to create authenticated fetch requests
  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      credentials: 'include', // This is crucial for sending session cookies
    });
  };

  // Effect for initial data loading and socket connection
  useEffect(() => {
    // 1. Fetch initial data (user, friends, requests)
    const fetchData = async () => {
      try {
        const userRes = await authFetch('/api/session');
        const userData = await userRes.json();
        if (!userData.loggedIn) {
          window.location.href = '/login'; // Redirect if not logged in
          return;
        }
        setCurrentUser(userData.user);

        const friendsRes = await authFetch('/api/friends');
        const friendsData = await friendsRes.json();
        setFriends(Array.isArray(friendsData) ? friendsData : []);

        const requestsRes = await authFetch('/api/friend-requests');
        const requestsData = await requestsRes.json();
        setFriendRequests(Array.isArray(requestsData) ? requestsData : []);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      }
    };

    fetchData();

    // 2. Connect the socket if it's not already connected
    if (!socket.connected) {
      socket.connect();
    }

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    // 3. Listen for incoming private messages
    const handlePrivateMessage = (message) => {
      console.log('Received private message:', message);
      // If the incoming message is for the currently active chat, update the messages state
      setActiveChat(currentActiveChat => {
        if (currentActiveChat && (message.sender_id === currentActiveChat.id || message.receiver_id === currentActiveChat.id)) {
          setMessages(prevMessages => {
            if (prevMessages.find(m => m.id === message.id)) {
              return prevMessages;
            }
            return [...(Array.isArray(prevMessages) ? prevMessages : []), message];
          });
        }
        return currentActiveChat;
      });
    };
    socket.on('private_message', handlePrivateMessage);

    // Listen for new friend requests
    const handleNewFriendRequest = (request) => setFriendRequests(prev => [request, ...(Array.isArray(prev) ? prev : [])]);
    socket.on('new_friend_request', handleNewFriendRequest);

    // Listen for when another user accepts your friend request
    const handleFriendRequestAccepted = (newFriend) => setFriends(prev => [newFriend, ...(Array.isArray(prev) ? prev : [])]);
    socket.on('friend_request_accepted', handleFriendRequestAccepted);

    // 4. Cleanup on component unmount
    return () => {
      console.log('Cleaning up socket listeners...');
      socket.off('private_message', handlePrivateMessage);
      socket.off('new_friend_request', handleNewFriendRequest);
      socket.off('friend_request_accepted', handleFriendRequestAccepted);
    };
  }, []);

  // Effect to scroll to the bottom of the message list when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim() === '') {
        setSearchResults([]);
        return;
      }
      try {
        const res = await authFetch(`/api/users/search?email=${searchQuery}`);
        const data = await res.json();
        if (res.ok) {
          setSearchResults(data);
        } else {
          console.error("Failed to search users:", data.error);
        }
      } catch (error) {
        console.error("Error searching users:", error);
      }
    };

    const debounceTimeout = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);


  // Function to handle selecting a friend to chat with
  const selectFriend = async (friend) => {
    setActiveChat(friend);
    setMessages([]); // Clear previous messages
    try {
      const res = await authFetch(`/api/messages/${friend.id}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
      } else {
        console.error("Failed to fetch messages:", data.error);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && activeChat && socket) {
      const messageData = {
        id: uuidv4(),
        content: newMessage,
        to: activeChat.id,
      };
      console.log('Sending private message:', messageData);

      // Emit the message to the server
      socket.emit('private_message', messageData, (response) => {
        if (response.error) {
          console.error('Message failed to send:', response.error);
        } else {
          console.log('Message sent successfully, response:', response);
          // Optimistically update the UI with the message sent back from the server
          setMessages(prevMessages => [...(Array.isArray(prevMessages) ? prevMessages : []), response.message]);
        }
      });

      setNewMessage('');
    }
  };

  const handleSendFriendRequest = async (email) => {
    try {
      const res = await authFetch('/api/friend-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Friend request sent!');
        setSearchResults(prev => prev.filter(user => user.email !== email));
      } else {
        alert(`Failed to send friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
      alert('Error sending friend request.');
    }
  };

  const handleAcceptFriendRequest = async (requestId) => {
    try {
      const res = await authFetch('/api/friend-request/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Friend request accepted!');
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
        // Add the new friend to the friends list
        const newFriend = friendRequests.find(req => req.id === requestId);
        if(newFriend) {
            setFriends(prev => [...(Array.isArray(prev) ? prev : []), {id: newFriend.sender_id, name: newFriend.name, email: newFriend.email}]);
        }
      } else {
        alert(`Failed to accept friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      alert('Error accepting friend request.');
    }
  };

  const handleRejectFriendRequest = async (requestId) => {
    try {
      const res = await authFetch('/api/friend-request/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Friend request rejected!');
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        alert(`Failed to reject friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      alert('Error rejecting friend request.');
    }
  };


  if (!currentUser) {
    return (
      <div className="flex h-screen bg-gray-100 items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search by email"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchResults.length > 0 && (
            <div>
              <h2 className="p-4 text-lg font-semibold">Search Results</h2>
              <ul>
                {searchResults.map(user => (
                  <li key={user.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <span>{user.name} ({user.email})</span>
                    <button onClick={() => handleSendFriendRequest(user.email)} className="p-2 text-blue-500">Add</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="p-4 text-lg font-semibold">Friend Requests</h2>
          {friendRequests.length > 0 ? (
            <ul>
              {friendRequests.map(req => (
                <li key={req.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                  <span>{req.name} ({req.email})</span>
                  <div className="flex space-x-2">
                    <button onClick={() => handleAcceptFriendRequest(req.id)} className="p-2 text-green-500">Accept</button>
                    <button onClick={() => handleRejectFriendRequest(req.id)} className="p-2 text-red-500">Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 text-gray-500">No new requests.</p>}

          <h2 className="p-4 text-lg font-semibold">Friends</h2>
          {friends.length > 0 ? (
            <ul>
              {friends.map(friend => (
                <li
                  key={friend.id}
                  onClick={() => selectFriend(friend)}
                  className={`p-4 hover:bg-gray-100 cursor-pointer ${activeChat?.id === friend.id ? 'bg-blue-100' : ''}`}
                >
                  {friend.name}
                </li>
              ))}
            </ul>
          ) : <p className="px-4 text-gray-500">Add some friends to start chatting.</p>}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200">
              <h2 className="text-xl font-semibold">Chat with {activeChat.name}</h2>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'} mb-4`}
                >
                  <div
                    className={`p-3 rounded-lg max-w-xs ${
                      message.sender_id === currentUser.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-300 text-black'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 p-2 border border-gray-300 rounded-l-lg"
                />
                <button
                  onClick={handleSendMessage}
                  className="p-2 bg-blue-500 text-white rounded-r-lg"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>Select a friend to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chatpage;
