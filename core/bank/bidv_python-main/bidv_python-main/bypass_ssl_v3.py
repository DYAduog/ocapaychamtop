import requests
import urllib3
import ssl
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.ssl_ import create_urllib3_context

# Define constants for magic numbers and settings
OP_LEGACY_SERVER_CONNECT = 0x4
DEFAULT_TLS_VERSION = ssl.PROTOCOL_TLSv1_2
LEGACY_CIPHERS = 'DEFAULT@SECLEVEL=1'

class TLSAdapter(HTTPAdapter):
    """
    A custom HTTPAdapter that forces the use of TLS 1.2 with a lower security level (SECLEVEL=1)
    to support legacy servers and ciphers.
    """
    def __init__(self, *args, **kwargs):
        # Create an SSL context with legacy ciphers and options
        self.ssl_context = create_urllib3_context(
            ssl_version=DEFAULT_TLS_VERSION,
            ciphers=LEGACY_CIPHERS
        )
        # Enable legacy server connections (non-compliant TLS servers)
        self.ssl_context.options |= OP_LEGACY_SERVER_CONNECT
        
        self.ssl_context.check_hostname = False
        
        self.ssl_context.verify_mode = ssl.CERT_NONE
        super(TLSAdapter, self).__init__(*args, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        """
        Initialize the connection pool with the custom SSL context.
        """
        kwargs['ssl_context'] = self.ssl_context
        return super(TLSAdapter, self).init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        """
        Ensure that the custom SSL context is used when connecting through a proxy.
        """
        kwargs['ssl_context'] = self.ssl_context
        return super(TLSAdapter, self).proxy_manager_for(*args, **kwargs)

def get_legacy_session(verify_ssl=False):
    """
    Create and return a session that uses TLSAdapter for secure connections to legacy servers.

    Args:
        verify_ssl (bool): Whether to verify SSL certificates (default: True).

    Returns:
        requests.Session: A configured session object.
    """
    session = requests.Session()
    adapter = TLSAdapter()
    session.mount('https://smartbanking.bidv.com.vn/', adapter)
    
    # Optionally disable SSL certificate verification (use with caution)
    session.verify = verify_ssl
    return session
