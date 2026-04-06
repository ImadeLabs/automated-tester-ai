# Use a pre-configured Puppeteer image (saves 15 mins of setup)
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to handle permissions
USER root

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (better for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your code
COPY . .

# Match the port in your server.js
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]