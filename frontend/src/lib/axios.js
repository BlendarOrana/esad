import axios from "axios";

const axiosInstance = axios.create({
	baseURL: import.meta.env.MODE === "development" ? "http://localhost:5000/api" : "/api",
	withCredentials: true, // send cookies to the server
});

// CSRF token storage
let csrfToken = null;

// Function to fetch CSRF token
const fetchCsrfToken = async () => {
	try {
		const response = await axios.get(
			import.meta.env.MODE === "development" 
				? "http://localhost:5000/api/csrf-token" 
				: "/api/csrf-token",
			{ withCredentials: true }
		);
		csrfToken = response.data.csrfToken;
		return csrfToken;
	} catch (error) {
		console.error("Failed to fetch CSRF token:", error);
		return null;
	}
};

// Request interceptor to add CSRF token
axiosInstance.interceptors.request.use(
	async (config) => {
		// Only add CSRF token for state-changing methods
		if (['post', 'put', 'delete', 'patch'].includes(config.method.toLowerCase())) {
			// If we don't have a token, fetch it
			if (!csrfToken) {
				await fetchCsrfToken();
			}
			
			// Add CSRF token to headers
			if (csrfToken) {
				config.headers['CSRF-Token'] = csrfToken;
			}
		}
		return config;
	},
	(error) => {
		return Promise.reject(error);
	}
);

// Response interceptor to handle CSRF errors
axiosInstance.interceptors.response.use(
	(response) => response,
	async (error) => {
		const originalRequest = error.config;

		// If we get a CSRF error and haven't retried yet
		if (
			error.response?.status === 403 && 
			error.response?.data?.code === 'EBADCSRFTOKEN' &&
			!originalRequest._retry
		) {
			originalRequest._retry = true;
			
			// Fetch a new CSRF token
			await fetchCsrfToken();
			
			// Retry the request with new token
			if (csrfToken) {
				originalRequest.headers['CSRF-Token'] = csrfToken;
				return axiosInstance(originalRequest);
			}
		}

		return Promise.reject(error);
	}
);

// Initialize CSRF token on app load
fetchCsrfToken();

export default axiosInstance;