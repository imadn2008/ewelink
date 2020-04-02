<?php
function p($s){ echo '<pre>' ; var_dump($s); echo '</pre>';}
require_once __DIR__ . '/vendor/autoload.php';

class Proxy{
    public $debug = false;

    public function __construct(){

        $method = $_SERVER['REQUEST_METHOD'] ;
        $url = $_GET['url'] ;
        //$body = file_get_contents('php://input') ? json_decode( file_get_contents('php://input'),true ) :'';
        $body = isset($_POST['data']) ? $_POST['data'] : '' ;
        $headers = getallheaders ();
        if (isset($headers['Authorization']))
            $headers = ['Authorization: '.$headers['Authorization'] ] ;

        $req =  $this->request($method,$url,$body,$headers) ;
        http_response_code($req['status']);
        echo $req['body'] ;
    }

    public function req($method,  $url,  $body,  $headers = []){
        $query_timeout = 10;
        $parts=parse_url($url);
        $port = isset($parts['port']) ? $parts['port'] : $parts['scheme'] == 'https' ? 443 : 80 ;
        $url = ($parts['scheme'] == 'https') ? 'ssl://' . $parts['host']  : $parts['host'] ;

        $req = $method ." " .(isset($parts['path']) ? $parts['path']: '/') . (isset($parts['query']) ? '?' . $parts['query'] : '') . " HTTP/1.1\r\n";
        $req .= "Host: " . $parts['host'] . "\r\n";

        if ($method == 'POST' && !empty($body))
        {
            $postdata_str = substr($body, 0, -1);
            $req .= 'Content-Type: application/x-www-form-urlencoded' . "\r\n";
            $req .= 'Content-Length: '. strlen($body) . "\r\n\r\n";
            $req .= $postdata_str;
        }else{
            $req .= "Content-Length: 0" . "\r\n";
            $req .= "Connection: Close\r\n\r\n";
        }

        foreach ($headers as $k => $v)
            $req .= $k .': '. $v . "\r\n";

        $fp = fsockopen( $url ,$port ,$errno, $errstr, $query_timeout);

        if (!$fp){
            return ['status'=>400,'body'=>"ERREUR : $errno - $errstr"];
        }

        if( is_resource($fp) ) {

            fputs( $fp, $req );
            stream_set_blocking($fp, true);
            stream_set_timeout($fp, $query_timeout);
            $loop_time = time();
            $status = socket_get_status($fp);
            $line = "";
            $header = "";
            $response = "";
            $end_header = false;

            while (!feof($fp) && !$status['timed_out']) {

                $line = fgets($fp, 4096);


                if (preg_match('/\\r\\n\\r\\n$/', $line)){
                    echo '<hr>' ;
                }else{
                    echo  $line;
                }

                /*
                    if (!($line == "\r\n")){
                        $end_header = true ;
                        echo($line);
                        $line = fgets($fp, 4096);
                        echo $line;
                        $line = fgets($fp, 4096);
                        echo $line;
                        $line = fgets($fp, 4096);
                        echo $line;
                        $line = fgets($fp, 4096);
                        echo $line;
                        $line = fgets($fp, 4096);
                        echo $line;
                        //http_parse_headers($line) ;
                        die ;
                        //('STOP');
                    }


                    if (!$end_header){
                        $header .= $line;
                    }else{
                        $response .= $line ;
                    }
                */

                if (time() - $loop_time > $query_timeout) break;
                if (connection_aborted()) break;

                $status = socket_get_status($fp);
            }
            fclose($fp);

            p($header);
            // p($response);
            die;
            return $header;


            fwrite($fp, $req);


            die;
            //return ['status'=>socket_get_status( $fp ),'body'=>$response];
            fclose($fp);


        }
    }

    public function request( $method,  $url,  $body,  $headers = []) {
        $ch = curl_init();
        curl_setopt($ch,CURLOPT_URL,$url);
        curl_setopt($ch,CURLOPT_TIMEOUT,15);
        curl_setopt($ch,CURLOPT_DNS_CACHE_TIMEOUT,300) ;
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 1);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);

        if ($method == "POST") {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($body){
                $headers[] = 'Content-Type: application/json' ;

                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body) );
            }
        }
        curl_setopt($ch,CURLOPT_HTTPHEADER,$headers);
        $response = curl_exec($ch) ;
        $header  = curl_getinfo( $ch );
     //   p($header);
        curl_close($ch);
        if ($this->debug) {
            echo $method . ' ' . $url;
            p($body);
            p($headers);
        }

        return ['status'=>$header['http_code'],'body'=>$response];
    }

}

new Proxy() ;