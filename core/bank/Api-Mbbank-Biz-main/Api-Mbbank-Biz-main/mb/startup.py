import time
import os
import signal
import logging
from multiprocessing import Process

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("Docker-Entrypoint")

# Global flag to control the main loop
running = True

def signal_handler(sig, frame):
    """Handle termination signals to gracefully shut down all processes."""
    global running
    logger.info(f"Received signal {sig}. Initiating graceful shutdown...")
    running = False

# Register signal handlers for graceful shutdown
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def start_fastapi():
    """Start the FastAPI server."""
    logger.info("Starting FastAPI server...")
    os.system("uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info")

def start_scheduler():
    """Start the scheduler with recurring tasks."""
    logger.info("Starting scheduler with recurring tasks...")
    # Wait a bit to ensure FastAPI is up and running
    time.sleep(15)
    
    # Run the scheduler with recurring tasks
    os.system("python schedule_module.py")
    
    logger.info("Scheduler process has exited")

if __name__ == "__main__":
    # Start FastAPI in a separate process
    fastapi_process = Process(target=start_fastapi)
    fastapi_process.start()
    logger.info(f"FastAPI process started with PID: {fastapi_process.pid}")

    # Start scheduler in a separate process with recurring tasks
    scheduler_process = Process(target=start_scheduler)
    scheduler_process.start()
    logger.info(f"Scheduler process started with PID: {scheduler_process.pid}")

    try:
        logger.info("Main process monitoring all services...")
        while running and fastapi_process.is_alive() and scheduler_process.is_alive():
            time.sleep(1)
            
        # Check which process died
        if not fastapi_process.is_alive():
            logger.error("FastAPI process has died unexpectedly!")
        if not scheduler_process.is_alive():
            logger.error("Scheduler process has died unexpectedly!")
    
    except Exception as e:
        logger.error(f"Error in main process: {str(e)}")
    finally:
        logger.info("Terminating processes...")
        for process, name in [(fastapi_process, "FastAPI"), (scheduler_process, "Scheduler")]:
            if process.is_alive():
                process.terminate()
                process.join(timeout=5)
                logger.info(f"{name} process terminated")
        
        logger.info("All processes terminated. Exiting.")