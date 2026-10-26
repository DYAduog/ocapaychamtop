<?php
if (!defined('IN_SITE')) {
    die('The Request Not Found');
}
class VIETTELPAY
{
    /**
     * @var string $phone
     */
    private $phone;

    /**
     * @var string $password
     */
    private $password;

    /**
     * @var string $imei
     */
    public $imei;

    /**
     * @var string $otp
     */
    public $otp;

    /**
     * @var string $requestId
     */
    public $requestId;

    /**
     * @var array $data
     */
    public  $data;

    /**
     * @var string $time
     */
    private $time;

    /**
     * @var ?string $msgType
     */
    private  $msgType = null;

    /**
     * @var array|string[] $msgTypes
     */
    private $msgTypes = [
        "SEND_OTP_MSG" => "https://api8.viettelpay.vn/auth/v1/authn/login",
        "USER_LOGIN_MSG" => "https://api8.viettelpay.vn/auth/v1/authn/login",
        "CHECK_BALANCE" => "https://api8.viettelpay.vn/whm/whm-core-service/public/v1/total-assets/find-total-assets",
        "HISTORY" => "https://api8.viettelpay.vn/gnotification-service/public/api/v1/notify/search?size=20&page=1",
    ];

    /**
     * @param string $phone
     * @param string $password
     */
    public function __construct(string $phone, string $password)
    {
        $this->phone = $phone;
        $this->password = $password;
    }

    /**
     * Tạo request gửi OTP đến số điện thoại
     *
     * @return bool|string
     */
    public function sendOTP()
    {
        $header = array(
            "Host: api8.viettelpay.vn",
            "Product: VIETTELPAY",
            "Authority-Party: APP",
            "Content-Type: application/json",
        );
        $data =  array(
            'msisdn' => $this->phone,
            'typeOs' => 'iOS',
            'imei' => $this->imei,
            'username' => $this->phone,
            'userType' => 'msisdn',
            'loginType' => 'BASIC'
        );
        return $this->CURL("https://api8.viettelpay.vn/auth/v1/authn/login", $header, $data);
    }

    public function refresh($accessToken, $refreshToken)
    {
        $header = array(
            "Host: api8.viettelpay.vn",
            "Product: VIETTELPAY",
            "Authority-Party: APP",
            "Authorization: Bearer $accessToken",
            "Content-Type: application/json",
        );
        $data =  array(
            'refreshToken' => $refreshToken,
        );
        return $this->CURL("https://api8.viettelpay.vn/auth/v1/authn/refresh", $header, $data);
    }

    public function loginUser()
    {
        $header = array(
            "Host: api8.viettelpay.vn",
            "Product: VIETTELPAY",
            "Authority-Party: APP",
            "Content-Type: application/json",
        );
        $data =  array(
            'msisdn' => $this->phone,
            'typeOs' => 'iOS',
            'otp' => $this->otp,
            'pin' => $this->password,
            'imei' => $this->imei,
            'username' => $this->phone,
            'userType' => 'msisdn',
            'loginType' => 'BASIC',
            'requestId' => $this->requestId,
        );
        return $this->CURL("https://api8.viettelpay.vn/auth/v1/authn/login", $header, $data);
    }
    public function loginRefresh()
    {
        $header = array(
            "Host: api8.viettelpay.vn",
            "Product: VIETTELPAY",
            "Authority-Party: APP",
            "Content-Type: application/json",
        );
        $data =  array(
            'msisdn' => $this->phone,
            'typeOs' => 'iOS',
            'pin' => $this->password,
            'imei' => $this->imei,
            'username' => $this->phone,
            'userType' => 'msisdn',
            'loginType' => 'SESSION',
        );
        return $this->CURL("https://api8.viettelpay.vn/auth/v1/authn/login", $header, $data);
    }
    public function getBalance($token,$phone)
    {
        $header = array(
            "Host: api8.viettelpay.vn",
            "Product: VIETTELPAY",
            "Authority-Party: APP",
            "Authorization: Bearer $token",
            "Content-Type: application/json",
        );
        $data =  array(
            'app_version' => '5.1.8',
            'app_name' => 'VIETTELPAY',
            'type_os' => 'ios',
            'body'=>array(
                'accountNo'=>$phone
            ),
            'imei' => $this->imei,
        );
        return $this->CURL("https://api8.viettelpay.vn/whm/whm-core-service/public/v1/total-assets/find-total-assets", $header, $data);
    }
    public function getHistory($token)
    {
        $header = array(
            "Host: api8.viettelpay.vn",
            "Product: VIETTELPAY",
            "Authority-Party: APP",
            "Authorization: Bearer $token",
            "Content-Type: application/json",
        );
        $data =  array(
            'status'=> [
                2,
                3,
                -1
              ],
            'app_version' => '5.1.8',
            'app_name' => 'VIETTELPAY',
            'size'=> 20,
            'type_os'=> 'ios',
            'page'=> 1,
            'imei' => $this->imei,
        );

        return $this->CURL("https://api8.viettelpay.vn/gnotification-service/public/api/v1/notify/search", $header, $data);
    }

    /**
     * Xác thực OTP trên thiết bị mới
     *
     * @param string $otp
     * @return bool|string
     */


    /**
     * Tạo microtime
     *
     * @return string
     */
    private function microtime()
    {
        $arr = explode(' ', microtime());

        return bcadd(($arr[0] * 1000), bcmul($arr[1], 1000));
    }

    /**
     * Tạo mã secure id
     *
     * @return string
     */
    private function secureId()
    {
        return $this->randomString(17);
    }

    /**
     * Tạo chuỗi ngẫu nhiên
     *
     * @param int $length
     * @return string
     */
    private function randomString(int $length = 10)
    {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $charactersLength = strlen($characters);
        $randomString = '';
        for ($i = 0; $i < $length; $i++) {
            $randomString .= $characters[rand(0, $charactersLength - 1)];
        }

        return $randomString;
    }

    /**
     * Tạo UUID cho imei
     *
     * @return string
     */
    private function generateUUID()
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff)
        );
    }

    /**
     * Tạo request
     *
     * @return bool|string
     */
    private function makeRequest($action, $header, $data)
    {
        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $this->msgTypes[$action],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => empty($data) ? 'GET' : 'POST',
            CURLOPT_POSTFIELDS => $data,
            CURLOPT_HTTPHEADER => $header,
        ));

        $response = curl_exec($curl);

        curl_close($curl);

        return $response;
    }
    public function CURL($Action, $header, $data)
    {
        //$Data = is_array($data) ? json_encode($data) : $data;

        $curl = curl_init();

        curl_setopt_array($curl, array(
            CURLOPT_URL => $Action,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_HTTPHEADER => $header,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => json_encode($data),
        ));

        $response = curl_exec($curl);

        curl_close($curl);

        return $response;
    }

    public function generateImei()
    {
        return $this->generateRandomString(8) . '-' . $this->generateRandomString(4) . '-' . $this->generateRandomString(4) . '-' . $this->generateRandomString(4) . '-' . $this->generateRandomString(12);
    }
    private function generateRandomString($length = 20)
    {
        $characters = '0123456789QWERTYUIOPASDFGHJKLMNBVCXZ';
        $charactersLength = strlen($characters);
        $randomString = '';
        for ($i = 0; $i < $length; $i++) {
            $randomString .= $characters[rand(0, $charactersLength - 1)];
        }
        return $randomString;
    }

    /**
     * Tạo mã checksum
     *
     * @return false|string
     */
    private function generateChecksum()
    {
        $l = $this->time . '000000';
        $data = $this->phone . $l . $this->msgType . ($this->time / 1e12) . 'E12';

        return openssl_encrypt($data, 'AES-256-CBC', substr('bef490fc-885a-44bd-89b9-66dd79bc', 0, 32), 0, '');
    }
}
