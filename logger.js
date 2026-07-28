class Logger {
  /**
   * Logs information messages.
   * @param message - The message to log.
   */
  protected logInfo(message) {
    console.log(message);
  }

  /**
   * Logs error messages.
   * @param message - The message to log.
   */
  protected logError(message) {
    console.error(message);
  }
}

module.exports = Logger;