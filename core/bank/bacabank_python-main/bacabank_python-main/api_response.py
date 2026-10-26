import json
from starlette.responses import Response

class APIResponse():
        def json_format(response,internal_error=False):
            
            if internal_error:
                response = {'code': 500, 'success': False, 'message': response}
                status_code = 500

            else:
                if 'code' in response:
                    status_code = response['code']
                    if int(status_code) < 200:
                        status_code = 500
                else:
                    response = {'code': 500, 'success': False, 'message': response}
                    status_code = 500
                
            return  Response(content=json.dumps(response),
                status_code=status_code,
                media_type="application/json"
                )