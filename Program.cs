using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Linq;
using System.Threading.Tasks;
using HtmlAgilityPack;
using System.Threading;
using System.Text.RegularExpressions;

// TODO: make pool entire class

namespace poolcontrol
{
    public class ConsoleSpinner
    {
        int counter;

        public void Turn()
        {
            counter++;        
            switch (counter % 4)
            {
                case 0: Console.Write("/"); counter = 0; break;
                case 1: Console.Write("-"); break;
                case 2: Console.Write("\\"); break;
                case 3: Console.Write("|"); break;
            }
            Thread.Sleep(100);
            Console.SetCursorPosition(Console.CursorLeft - 1, Console.CursorTop);
        }
    }
    public class PoolDetails 
    {
        public bool Filter {get; set;}
        public bool Lights {get; set;}
        public bool SpaLights {get;set;}
        public bool Waterfall {get;set;}

        public string SaltLevel {get;set;}
        public string AirTemp {get;set;}
        public string PoolTemp {get;set;}
        public string SpaTemp {get;set;}
        public string HeaterMode {get;set;}
        public string FilterSpeed {get;set;}
        public string PoolChlorinator {get;set;}
        public string SpaChrolrinator {get;set;}
        public PoolMode poolMode {get;set;}


        public enum PoolMode : int
        {
            Pool = 0,
            Spa  = 1,
            Unknown = 2
        }


        public string UnknownMessage {get;set;}

        public PoolDetails()
        {
            this.AirTemp = "-nl-";
            this.SaltLevel = "-nl-";
            this.PoolTemp = "-nl-";
            this.SpaTemp = "-nl-";
            this.UnknownMessage = String.Empty;
            this.HeaterMode = "-nl-";
            this.FilterSpeed = "-nl-";
            this.PoolChlorinator = "-nl-";
            this.SpaChrolrinator = "-nl-";
            this.poolMode = PoolMode.Unknown;
        }

        public void updateFromPanel(List<string> panelDetails) 
        {
            var poolDetailsArray = panelDetails[3].ToCharArray();

            switch(poolDetailsArray[0]) {
                case 'E':
                    this.poolMode = PoolMode.Spa;
                    break;
                case 'T':
                    this.poolMode = PoolMode.Pool;
                    break;
                default:
                    this.poolMode = PoolMode.Unknown;
                    break;
            }
            
            if(poolDetailsArray[1] == 'E') {this.Filter = true; };
            if(poolDetailsArray[2] == 'S') {this.Lights = true; };
            if(poolDetailsArray[4] == '5') {this.SpaLights = true; };
            if(poolDetailsArray[5] == 'S') {this.Waterfall = true; };

            // parse screen
            var line1 = panelDetails[1];
            var line2 = panelDetails[2];

            switch(line1.Substring(0, 6)) {//heater1, filter speed
                case "Air Te":
                    this.AirTemp = line1.Replace("Air Temp ","").TrimmedForDisplay();
                    break;
                case "Salt L":
                    this.SaltLevel = line2.TrimmedForDisplay().TrimEnd(' ');
                    break;
                case "Heater":
                    this.HeaterMode = line2.TrimmedForDisplay().TrimEnd(' ');
                    break;
                case "Filter":
                    this.FilterSpeed = line2.TrimmedForDisplay().TrimEnd(' ');
                    break;
                case "date":
                    break;
                case "Pool T":
                    this.PoolTemp = line1.Replace("Pool Temp","").TrimmedForDisplay();
                    WriteTemperatureData(this.PoolTemp);
                    break;
                case "Pool C":
                    this.PoolChlorinator = line2.TrimmedForDisplay().TrimEnd(' ');
                    break;
                case "Spa Te":
                    this.SpaTemp = line1.Replace("Spa Temp","").TrimmedForDisplay();
                    break;
                case "Spa Ch":
                    this.SpaChrolrinator = line2.TrimmedForDisplay().TrimEnd(' ');
                    break;
                default:
                    this.UnknownMessage = line1 + "--" + line2;
                    break;
            }



            //Console.WriteLine(line1);
            //Console.WriteLine(line2);

            //Console.WriteLine("--------------");

        }

        
            public static void ObtainSetPoints()
            {
                // menu, left, right, plus, minus
                // 02, 03, 01, 06, 05
            }
    }

    public static class MyExtensions
    {
        public static String TrimmedForDisplay(this String str)
        {
            var returnStr = str;
            returnStr.TrimEnd('\r', '\n');;
            returnStr = Regex.Replace(returnStr, @"\s{2,}", " ");
            return returnStr;
        }
    }

    class Program
    {
        private static readonly HttpClient client = new HttpClient();

        static async Task Main(string[] args)
        {
            PoolDetails poolDetails = new PoolDetails();

            /*var spin = new ConsoleSpinner();
            Console.Write("Working....");
            while (true) 
            {
                spin.Turn();
            }*/

            Console.WriteLine("test set point collect");
            var setPoint = await GetPoolSetPoint();
            Console.WriteLine("Pool Set Point:" + setPoint);

            Console.WriteLine("");
            Console.WriteLine("AquaConnect Pool Control");
            Console.WriteLine("-----------------------------");
            var spinnerCounter = 0;

            while(true) {
                var panelDetails = await GetPoolUpdate();
                poolDetails.updateFromPanel(panelDetails);
                UpdateDisplay(poolDetails, spinnerCounter);
                spinnerCounter++;
                if (spinnerCounter >3) { spinnerCounter = 0;};
                Thread.Sleep(500);
            }
            

        }

        private static String GetFixedWidthString(String inputString, int length)
        {
            var remaining = length - inputString.Length;
            var returnString = inputString;
            
            for(int i = 0; i < remaining; i++)
            {
                returnString += " ";
            }

            return returnString;

        }


        private static void UpdateDisplay(PoolDetails poolDetails, int spinnerCounter)
        {
            var StatusStringClean = String.Empty;
            var cursorTop = Console.CursorTop;
            var cursorLeft = Console.CursorLeft;
      
            switch (spinnerCounter % 4)
            {
                case 0: Console.WriteLine("[ .    ]"); break;
                case 1: Console.WriteLine("[ ..   ]"); break;
                case 2: Console.WriteLine("[ ...  ]"); break;
                case 3: Console.WriteLine("[ .... ]"); break;
            }

            //var StatusStringLine1 = String.Format("Filter: {0} | Spa Lights: {1} | Unknown Msg: {2}", "Filter: poolDetails.Filter, poolDetails.SpaLights, poolDetails.UnknownMessage);
            var StatusStringLine1 = string.Empty;

            StatusStringLine1 = GetFixedWidthString(String.Format(">> {0} <<", poolDetails.poolMode.ToString()), 8);
            StatusStringLine1 += " | ";

            if(poolDetails.poolMode == PoolDetails.PoolMode.Pool) {
                StatusStringLine1 += GetFixedWidthString(String.Format(" [PoolTemp] {0}", poolDetails.PoolTemp), 17);
            } else {
                StatusStringLine1 += GetFixedWidthString(String.Format(" [SpaTemp] {0}", poolDetails.SpaTemp), 16);
            }
            StatusStringLine1 += " | ";
            StatusStringLine1 += GetFixedWidthString(String.Format(" [AirTemp] {0}", poolDetails.AirTemp), 16);
            StatusStringLine1 += " | ";
            StatusStringLine1 += GetFixedWidthString(String.Format(" [Salt] {0}", poolDetails.SaltLevel), 16);
            StatusStringLine1 += " | ";

            if(poolDetails.poolMode == PoolDetails.PoolMode.Pool) {
                StatusStringLine1 += GetFixedWidthString(String.Format(" [Chlorinator] {0}", poolDetails.PoolChlorinator), 16);
            } else {
                StatusStringLine1 += GetFixedWidthString(String.Format(" [Chlorinator] {0}", poolDetails.SpaChrolrinator), 16);
            }
            StatusStringLine1 += " | ";
            StatusStringLine1 += GetFixedWidthString(String.Format("[Filter] {0}", poolDetails.Filter ? "ON" : "OFF"), 12);
            StatusStringLine1 += " | ";
            StatusStringLine1 += GetFixedWidthString(String.Format("[Lights] {0}", poolDetails.Lights ? "ON" : "OFF"), 10);
            StatusStringLine1 += " | ";
            StatusStringLine1 += GetFixedWidthString(String.Format("[SpaLights] {0}", poolDetails.SpaLights ? "ON" : "OFF"), 16);
            StatusStringLine1 += " | ";
            StatusStringLine1 += GetFixedWidthString(String.Format("[Waterfall] {0}", poolDetails.Waterfall ? "ON" : "OFF"), 16);

            //StatusStringClean = Regex.Replace(StatusStringLine1, @"<[^>]+>|&nbsp;", "").Trim();
            //StatusStringClean = Regex.Replace(StatusStringLine1, @"\s{2,}", " ");
            //StatusStringLine1 = StatusStringClean;

            Console.WriteLine(StatusStringLine1);

            var StatusStringLine2 = String.Format("FilterSpeed: {0}", poolDetails.FilterSpeed);
            //var StatusStringLine2 = String.Format("yayayya");
            StatusStringClean = Regex.Replace(StatusStringLine2, @"<[^>]+>|&nbsp;", "").Trim();
            StatusStringClean = StatusStringClean.TrimmedForDisplay();
            StatusStringLine2 = StatusStringClean;

            Console.WriteLine(StatusStringLine2);

            var StatusStringLine3 = String.Format("Heater Mode: {0}", poolDetails.HeaterMode);
            //var StatusStringLine2 = String.Format("yayayya");
            StatusStringClean = Regex.Replace(StatusStringLine3, @"<[^>]+>|&nbsp;", "").Trim();
            StatusStringClean = StatusStringClean.TrimmedForDisplay();
            StatusStringLine3 = StatusStringClean;

            Console.WriteLine(StatusStringLine3);

            var StatusStringLine4 = String.Format("Unknown Msg: {0}", poolDetails.UnknownMessage);
            //var StatusStringLine2 = String.Format("yayayya");
            StatusStringClean = Regex.Replace(StatusStringLine4, @"<[^>]+>|&nbsp;", "").Trim();
            StatusStringClean = StatusStringClean.TrimmedForDisplay();
            StatusStringLine4 = StatusStringClean;

            Console.WriteLine(StatusStringLine4);

            Console.SetCursorPosition(0, Console.CursorTop -5);
            

/*
            Console.Write("Filter: " + poolDetails.Filter.ToString() + " | " + "Lights: " + poolDetails.Lights.ToString() + " | ");
            Console.Write("Spa Lights: " + poolDetails.SpaLights.ToString() + " | ");
            Console.Write("Waterfall: " + poolDetails.Waterfall.ToString() + " | ");
            Console.Write("Salt Level: " + poolDetails.SaltLevel.ToString() + " | ");
            Console.Write("Air Temp: " + poolDetails.AirTemp.ToString() + " | ");
            if(!(String.IsNullOrEmpty(poolDetails.UnknownMessage))) { 
                Console.Write("!! UNKNOWN MSG: " + poolDetails.UnknownMessage.ToString() + " | ");
            }
            Console.Write("Heater1 mode: " + poolDetails.HeaterMode.ToString() + " | ");
            Console.Write("Filter Speed: " + poolDetails.FilterSpeed.ToString() + " | ");
            */

        }

        private static async Task<List<string>> GetPoolUpdate()
        {
            client.DefaultRequestHeaders.Accept.Clear();

            var response = await client.GetAsync("http://10.33.103.66/WNewSt.htm");
            var pageContents = await response.Content.ReadAsStringAsync();

            HtmlDocument pageDocument = new HtmlDocument();
            pageDocument.LoadHtml(pageContents);
            var poolDisplay = pageDocument.DocumentNode.SelectSingleNode("(/html/body)").InnerText;
            List<string> displayLines = poolDisplay.Split("\n").ToList();


            List<string> displayLinesClean = new List<string>();
            
            displayLines.ForEach(x => {
                                                string y = x.Replace("xxx", "");
                                                y = y.Replace("&#176","");
                                                y = y.TrimStart();
                                                
                                                displayLinesClean.Add(y);
            });

            return displayLinesClean;
        }

        private static async Task<void> WriteTemperatureData(string tempValue)
        {
            var timestreamWriteClientConfig = new AmazonTimestreamWriteConfig
            {
                RegionEndpoint = RegionEndpoint.USWest2
                Timeout = TimeSpan.FromSeconds(20),
                MaxErrorRetry = 10
            };

            var timestreamWriteClient = new AmazonTimestreamWriteClient(timestreamWriteClientConfig);
        
            Console.WriteLine("Writing records");

            DateTimeOffset now = DateTimeOffset.UtcNow;
            string currentTimeString = (now.ToUnixTimeMilliseconds()).ToString();

            List<Dimension> dimensions = new List<Dimension>{
                new Dimension { Name = "pooltemp", Value = "charentes" },
                new Dimension { Name = "temptype", Value = "water" }
            };

            var temp = new Record
            {
                Dimensions = dimensions,
                MeasureName = "pooltemp_water",
                MeasureValue = tempValue,
                MeasureValueType = MeasureValueType.DOUBLE,
                Time = currentTimeString
            };


            List<Record> records = new List<Record> {
               temp
            };

            try
            {
                var writeRecordsRequest = new WriteRecordsRequest
                {
                    DatabaseName = "tbird-poolcontrol"
                    TableName = "pool-env-watertemp"
                    Records = records
                };
                WriteRecordsResponse response = await timestreamWriteClient.WriteRecordsAsync(writeRecordsRequest);
                Console.WriteLine($"Write records status code: {response.HttpStatusCode.ToString()}");
            } 
            catch (RejectedRecordsException e) {
                Console.WriteLine("RejectedRecordsException:" + e.ToString());
                foreach (RejectedRecord rr in e.RejectedRecords) {
                    Console.WriteLine("RecordIndex " + rr.RecordIndex + " : " + rr.Reason);
                }
                Console.WriteLine("Other records were written successfully. ");
            }
            catch (Exception e)
            {
                Console.WriteLine("Write records failure:" + e.ToString());
            }
        }

        private static async Task<string> GetPoolSetPoint()
        {
            var url = "http://10.33.103.66/WNewSt.htm";
    

            var httpClient = new HttpClient();
            httpClient.DefaultRequestHeaders.Accept.Clear();
            httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "02"));

            var payload = new FormUrlEncodedContent(payloadPairs);
            
            var response = await httpClient.PostAsync(url, payload);
            var pageContents = await response.Content.ReadAsStringAsync();

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "01"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "01"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            // read temp

            Thread.Sleep(1000);
            response = await client.GetAsync("http://10.33.103.66/WNewSt.htm");
            pageContents = await response.Content.ReadAsStringAsync();

            HtmlDocument pageDocument = new HtmlDocument();
            pageDocument.LoadHtml(pageContents);
            var poolDisplay = pageDocument.DocumentNode.SelectSingleNode("(/html/body)").InnerText;
            List<string> displayLines = poolDisplay.Split("\n").ToList();


            List<string> displayLinesClean = new List<string>();
            
            displayLines.ForEach(x => {
                                                string y = x.Replace("xxx", "");
                                                y = y.Replace("&#176","");
                                                y = y.TrimStart();
                                                
                                                displayLinesClean.Add(y);
            });

            var poolTemp = displayLinesClean[2].TrimmedForDisplay().TrimEnd(' ');

            // return to default menu TODO function this

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "02"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "02"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "02"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "02"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            Thread.Sleep(1000);
            httpClient = new HttpClient();

            payloadPairs = new List<KeyValuePair<string, string>>();
            payloadPairs.Add(new KeyValuePair<string, string>("KeyId", "01"));

            payload = new FormUrlEncodedContent(payloadPairs);
            
            response = await httpClient.PostAsync(url, payload);
            pageContents = await response.Content.ReadAsStringAsync();

            return poolTemp;
            
        }

    }
    
}
