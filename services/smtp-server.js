const { SMTPServer } = require('smtp-server');

class LightweightSMTPServer {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.port = process.env.SMTP_PORT || 2525;
    this.emailQueue = [];
  }

  initialize() {
    return new Promise((resolve, reject) => {
      try {
        // Create a simple SMTP server that accepts all emails
        this.server = new SMTPServer({
          // Allow connections without authentication
          disabledCommands: ['AUTH'],
          
          // Accept all recipients
          onRcptTo: (address, session, callback) => {
            console.log(`[SMTP] メール受信者: ${address.address}`);
            callback();
          },

          // Handle incoming emails
          onData: (stream, session, callback) => {
            let emailData = '';
            
            stream.on('data', (chunk) => {
              emailData += chunk;
            });

            stream.on('end', () => {
              // Log the email for debugging purposes
              console.log(`[SMTP] メール受信完了:`);
              console.log(`  送信者: ${session.envelope.mailFrom?.address || 'unknown'}`);
              console.log(`  受信者: ${session.envelope.rcptTo.map(addr => addr.address).join(', ')}`);
              console.log(`  データサイズ: ${emailData.length} bytes`);
              
              // Store email in queue for development/testing purposes
              this.emailQueue.push({
                from: session.envelope.mailFrom?.address || 'unknown',
                to: session.envelope.rcptTo.map(addr => addr.address),
                data: emailData,
                timestamp: new Date().toISOString()
              });

              // Keep only last 50 emails in memory
              if (this.emailQueue.length > 50) {
                this.emailQueue.shift();
              }

              callback();
            });
          },

          // Error handling
          onError: (err) => {
            console.error('[SMTP] サーバーエラー:', err);
          }
        });

        // Start the server
        this.server.listen(this.port, '127.0.0.1', (err) => {
          if (err) {
            console.error('[SMTP] サーバー起動エラー:', err);
            reject(err);
            return;
          }
          
          this.isRunning = true;
          console.log(`[SMTP] 軽量SMTPサーバーが 127.0.0.1:${this.port} で起動しました`);
          resolve();
        });

        // Handle server errors
        this.server.on('error', (err) => {
          console.error('[SMTP] サーバーエラー:', err);
          this.isRunning = false;
        });

      } catch (error) {
        console.error('[SMTP] 初期化エラー:', error);
        reject(error);
      }
    });
  }

  getStatus() {
    return {
      running: this.isRunning,
      port: this.port,
      emailCount: this.emailQueue.length,
      lastEmail: this.emailQueue.length > 0 ? this.emailQueue[this.emailQueue.length - 1] : null
    };
  }

  getRecentEmails(limit = 10) {
    return this.emailQueue.slice(-limit).reverse();
  }

  close() {
    if (this.server && this.isRunning) {
      this.server.close(() => {
        console.log('[SMTP] SMTPサーバーを停止しました');
        this.isRunning = false;
      });
    }
  }
}

module.exports = new LightweightSMTPServer();