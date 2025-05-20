# Use official Node.js image
FROM node:18

# Create app directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app's code
COPY . .

# Expose the port your app runs on (change if your app uses a different one)
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
