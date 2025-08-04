const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { execSync } = require('child_process');
const { getFilesRecursively } = require('./utils/fileUtils');
// Claude Code SDK variables and functions
let claudeQuery;
let isClaudeInitializing = false;
let claudeInitializationRetries = 0;
const MAX_CLAUDE_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Sleep utility for retry delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize Claude Code SDK with retry logic
async function initializeClaudeCode() {
    if (isClaudeInitializing) {
        console.log('Claude Code SDK initialization already in progress...');
        return;
    }
    
    isClaudeInitializing = true;
    
    while (claudeInitializationRetries < MAX_CLAUDE_RETRIES) {
        try {
            console.log(`Initializing Claude Code SDK... (attempt ${claudeInitializationRetries + 1}/${MAX_CLAUDE_RETRIES})`);
            const module = await import("@anthropic-ai/claude-code");
            claudeQuery = module.query;
            console.log('Claude Code SDK initialized successfully');
            claudeInitializationRetries = 0; // Reset on success
            break;
        } catch (err) {
            claudeInitializationRetries++;
            
            logError(err, `Claude Code Initialization (attempt ${claudeInitializationRetries})`);
            
            if (claudeInitializationRetries >= MAX_CLAUDE_RETRIES) {
                console.error('Max initialization retries reached. Claude Code SDK will not be available.');
                throw err;
            }
            
            console.log(`Retrying in ${RETRY_DELAY_MS}ms...`);
            await sleep(RETRY_DELAY_MS);
        }
    }
    
    isClaudeInitializing = false;
}

// Check if Claude Code SDK is initialized
function isClaudeInitialized() {
    return claudeQuery !== undefined;
}
const { commitAndPushChanges } = require('./utils/gitUtils');
const { commitToGitRepo, buildAndUpload } = require('./utils/buildUtils');
require('dotenv').config();
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced error logging function
function logError(error, context = 'Unknown') {
    const timestamp = new Date().toISOString();
    console.error(`\n=== ERROR at ${timestamp} in ${context} ===`);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code || 'N/A');
    if (error.stack) {
        console.error('Stack trace:', error.stack);
    }
    if (error.cause) {
        console.error('Caused by:', error.cause);
    }
    console.error('=== END ERROR ===\n');
}

// Global error handlers to prevent process crashes
process.on('uncaughtException', (error) => {
    logError(error, 'Uncaught Exception');
    console.error('CRITICAL: Uncaught exception occurred. Server will attempt to continue...');
    // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n=== UNHANDLED REJECTION ===');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    if (reason && reason.stack) {
        console.error('Stack:', reason.stack);
    }
    console.error('=== END UNHANDLED REJECTION ===\n');
    // Don't exit the process, just log the error
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

// Middleware
app.use(cors());
app.use(express.json());

// Request timeout middleware
const REQUEST_TIMEOUT_MS = 300000; // 5 minutes
app.use((req, res, next) => {
    // Set timeout for all requests
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        if (!res.headersSent) {
            logError(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`), `${req.method} ${req.path}`);
            res.status(408).json({
                error: 'Request timeout',
                message: `Request took longer than ${REQUEST_TIMEOUT_MS}ms`,
                timestamp: new Date().toISOString()
            });
        }
    });
    next();
});

// Initialize Claude Code SDK with enhanced error handling
initializeClaudeCode().catch(err => {
    logError(err, 'Claude Code SDK Initialization');
});


app.get('/health', (req, res) => {
    res.json({
        message: "API is running",
        status: "active",
        timestamp: new Date().toISOString()
    });
});

// GET gh-test
app.get('/gh-test', (req, res) => {

    const result = commitAndPushChanges();
    
    if (result.success) {
        res.status(200).json({
            message: result.message,
            status: result.status,
            details: result.details
        });
    } else {
        res.status(500).json({
            message: result.message,
            status: result.status,
            details: result.details
        });
    }
});


// Endpoint for creating previews via LLM
app.post('/generate-preview', async (req, res) => {
    try {
        // Check if query is available
        if (!isClaudeInitialized()) {
            console.error('Query function not available');
            res.status(500).json({ error: 'Claude Code SDK not initialized' });
            return;
        }

        // Get message from request body
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ 
                error: 'Message is required',
                timestamp: new Date().toISOString()
            });
        }

        // Set up SSE headers for streaming
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        const query = claudeQuery;

        // Send initial status
        res.write(`data: ${JSON.stringify({
            type: 'status',
            message: 'Starting LLM processing...',
            timestamp: new Date().toISOString()
        })}\n\n`);

        // Call LLM to update the project
        const messageStream = query({
            prompt: message,
            options: {
                maxTurns: 50,
                permissionMode: 'acceptEdits',
                cwd: './project',
            },
        });

        // Process the stream and forward to client with enhanced error handling
        try {
            for await (const message of messageStream) {
                console.log('Received message from stream:', message);
                
                // Check for error messages in the stream
                if (message.type === 'result' && message.is_error) {
                    logError(new Error(`Claude Code Stream Error: ${message.result}`), 'Claude Code Stream Processing');
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        error: 'Claude Code processing error',
                        details: message.result,
                        message: message,
                        timestamp: new Date().toISOString()
                    })}\n\n`);
                    continue;
                }
                
                // Send each message to the client
                res.write(`data: ${JSON.stringify({
                    type: 'llm_message',
                    message: message,
                    timestamp: new Date().toISOString()
                })}\n\n`);
            }
        } catch (streamError) {
            logError(streamError, 'Claude Code Stream Processing');
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Stream processing failed',
                details: streamError.message,
                timestamp: new Date().toISOString()
            })}\n\n`);
            // Don't return here, continue with the rest of the process
        }

        // Send commit status
        res.write(`data: ${JSON.stringify({
            type: 'status',
            message: 'LLM processing complete. Committing changes...',
            timestamp: new Date().toISOString()
        })}\n\n`);

        // Commit changes with status updates
        const result = commitToGitRepo({
            commitMessage: "Static update message to ensure error is not coming from this.",
            statusCallback: (status) => {
                res.write(`data: ${JSON.stringify(status)}\n\n`);
            }
        });

        if (!result.success) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Commit failed',
                details: result.error,
                timestamp: new Date().toISOString()
            })}\n\n`);
        }

        res.end();
    } catch (error) {
        logError(error, 'Generate Preview Endpoint');
        
        // Send error via SSE if headers haven't been sent yet
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });
        }
        
        // Enhanced error response with more details
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'Update failed',
            details: error.message,
            errorName: error.name,
            errorCode: error.code || 'N/A',
            stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack trace',
            timestamp: new Date().toISOString()
        })}\n\n`);
        
        res.end();
    }
});

// Files endpoint
app.get('/files', (req, res) => {
    const projectPath = './project';
    
    try {
        // Check if directory exists
        if (!fs.existsSync(projectPath)) {
            return res.status(404).json({
                message: "Project directory not found",
                status: "error",
                path: projectPath,
                timestamp: new Date().toISOString()
            });
        }
        
        const files = getFilesRecursively(projectPath);
        res.json({
            message: "Files and folders in /project",
            status: "success",
            timestamp: new Date().toISOString(),
            data: files
        });
    } catch (error) {
        res.status(500).json({
            message: "Error reading project directory",
            status: "error",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Claude Code SDK status endpoint
app.get('/claude-status', (req, res) => {
    try {
        const status = {
            isInitialized: isClaudeInitialized(),
            isInitializing: isClaudeInitializing,
            hasQuery: claudeQuery !== undefined,
            initializationRetries: claudeInitializationRetries,
            maxRetries: MAX_CLAUDE_RETRIES
        };
        res.json({
            message: "Claude Code SDK Status",
            status: "success",
            timestamp: new Date().toISOString(),
            data: status
        });
    } catch (error) {
        res.status(500).json({
            message: "Error getting Claude Code SDK status",
            status: "error",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Deploy endpoint - builds project and deploys to S3 production
app.post('/deploy', async (req, res) => {
    try {
        // Set up SSE headers for streaming
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial status
        res.write(`data: ${JSON.stringify({
            type: 'status',
            message: 'Starting build and deployment to production...',
            timestamp: new Date().toISOString()
        })}\n\n`);

        // Build and upload to S3 production with status updates
        const result = buildAndUpload({
            statusCallback: (status) => {
                res.write(`data: ${JSON.stringify(status)}\n\n`);
            }
        });

        if (!result.success) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Build and deployment failed',
                details: result.error,
                timestamp: new Date().toISOString()
            })}\n\n`);
        }

        res.end();
    } catch (error) {
        console.error('Error in deployment:', error);
        
        // Send error via SSE if headers haven't been sent yet
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });
        }
        
        // Standard error response
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'Deployment failed',
            details: error.message,
            timestamp: new Date().toISOString()
        })}\n\n`);
        
        res.end();
    }
});

// PUT request to /config to update the manifest.config.json file
app.put('/config', async (req, res) => {
    try {
        const configPath = './project/manifest.config.json';
        
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                message: "Config file not found",
                status: "error",
                timestamp: new Date().toISOString()
            });
        }
        
        // Read existing config
        const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Deep merge function to handle nested objects
        function deepMerge(target, source) {
            const result = { ...target };
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = deepMerge(target[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
            return result;
        }
        
        // Merge new data with existing config using deep merge
        const updatedConfig = deepMerge(existingConfig, req.body);
        
        // Write updated config back to file
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 4));

        // Set up SSE headers for streaming
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial response with updated config
        res.write(`data: ${JSON.stringify({
            type: 'config_updated',
            config: updatedConfig,
            timestamp: new Date().toISOString()
        })}\n\n`);

        // Commit changes with status updates
        const result = commitToGitRepo({
            commitMessage: 'Update configuration via API',
            statusCallback: (status) => {
                res.write(`data: ${JSON.stringify(status)}\n\n`);
            }
        });

        if (!result.success) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Commit failed',
                details: result.error,
                timestamp: new Date().toISOString()
            })}\n\n`);
        }

        res.end();
    } catch (error) {
        console.error('Error in config update:', error);
        
        // Send error via SSE if headers haven't been sent yet
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });
        }
        
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'Config update failed',
            details: error.message,
            timestamp: new Date().toISOString()
        })}\n\n`);
        
        res.end();
    }
});

// GET request to /config to get the manifest.config.json file
app.get('/config', (req, res) => {
    try {
        const configPath = './project/manifest.config.json';
        
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                message: "Config file not found",
                status: "error",
                timestamp: new Date().toISOString()
            });
        }
        
        // Read and parse the config file
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        res.json(configData);
    } catch (error) {
        res.status(500).json({
            message: "Error reading config file",
            status: "error",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});


app.use(
    '/',
    createProxyMiddleware({
      target: 'http://localhost:5173', // dev server
      changeOrigin: true,
      pathRewrite: { '^/project': '' }, // remove /project prefix
      ws: true // proxy websockets for hot reload
    })
  );


// Start server
app.listen(PORT, () => {
    console.log(`API server is running on port ${PORT}`);
}); 