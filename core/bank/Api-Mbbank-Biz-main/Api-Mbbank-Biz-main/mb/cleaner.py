import os
import logging
import datetime
from pathlib import Path
import glob

logger = logging.getLogger(__name__)


# Enhanced function to find data directory
def find_data_directory():
    """Find the data directory using multiple approaches to handle both Docker and Mac environments."""
    logger.info("Searching for data directory...")
    
    # Use environment variable if set (from Docker)
    env_data_dir = os.environ.get("DATA_DIR")
    if env_data_dir and os.path.exists(env_data_dir):
        logger.info(f"Using data directory from environment: {env_data_dir}")
        return Path(env_data_dir)
    
    # Try multiple possible locations
    possible_paths = [
        Path('./data'),                          # Current directory (run.py location)
        Path('data'),                            # Current directory (alternative)
        Path('./MB_fastAPI/data'),               # Relative to project root for Mac
        Path('MB_fastAPI/data'),                 # Alternative Mac path
        Path(os.path.dirname(__file__)) / 'data',  # Script directory
        # Removed /app/data which doesn't work on Mac
    ]
    
    # Try each path and use the first one that exists or create the default
    for path in possible_paths:
        try:
            logger.info(f"Checking path: {path.absolute()}")
            if path.exists() and path.is_dir():
                logger.info(f"Found existing data directory: {path.absolute()}")
                return path
        except Exception as e:
            logger.warning(f"Error checking path {path}: {e}")
    
    # If none exist, create in the current directory
    default_path = Path('./data')
    logger.info(f"No existing data directory found. Creating: {default_path.absolute()}")
    default_path.mkdir(exist_ok=True)
    return default_path


# Add utility function for timestamp formatting
# def format_timestamp_consistently(timestamp_str):
#     """Convert any timestamp format to dd-mm-yyyy HH:MM:SS format"""
#     try:
#         # If timestamp is already in the desired format, return it
#         if len(timestamp_str) == 19 and timestamp_str[2] == '-' and timestamp_str[5] == '-':
#             return timestamp_str
            
#         # Handle ISO format (YYYY-MM-DDTHH:MM:SS.mmmmmm)
#         elif 'T' in timestamp_str:
#             dt = datetime.datetime.fromisoformat(timestamp_str.split('.')[0])
#             return dt.strftime('%d-%m-%Y %H:%M:%S')
            
#         # Handle other formats
#         else:
#             dt = datetime.datetime.fromisoformat(timestamp_str) if '.' in timestamp_str else datetime.datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
#             return dt.strftime('%d-%m-%Y %H:%M:%S')
#     except Exception:
#         # Return original if parsing fails
#         return timestamp_str


# def cleanup_json_files(file_to_keep):
#     """Remove all JSON files in the data directory except the specified file."""
#     try:
#         data_dir = find_data_directory()
#         if not data_dir.exists():
#             return
            
#         kept_count = 0
#         deleted_count = 0
        
#         for file_path in data_dir.glob('*.json'):
#             if file_path != file_to_keep:
#                 logger.debug(f"Removing file: {file_path}")
#                 file_path.unlink()
#                 deleted_count += 1
#             else:
#                 kept_count += 1
                
#         logger.info(f"Cleanup complete. Kept {kept_count} file, deleted {deleted_count} files.")
#     except Exception as e:
#         logger.error(f"Error cleaning up JSON files: {e}")

def cleanup_data_directory(file_patterns=["mb_biz_transactions_*.json"], except_files=None):
    if except_files is None:
        except_files = []
        
    try:
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        
        # Find files to delete
        json_files = []
        for pattern in file_patterns:
            json_files.extend(glob.glob(os.path.join(data_dir, pattern)))
            
        files_to_delete = [f for f in json_files if f not in except_files]
        
        if not files_to_delete:
            return 0
        
        # Delete files
        deleted_count = 0
        for file_path in files_to_delete:
            try:
                os.remove(file_path)
                deleted_count += 1
            except Exception as e:
                logger.warning(f"Failed to delete {os.path.basename(file_path)}: {e}")
        
        logger.info(f"Cleanup: deleted {deleted_count}/{len(files_to_delete)} files")
        return deleted_count
        
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        return 0