using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace Linker {
 public class ProgressWindow : Window {
  readonly JavaScriptSerializer json = new JavaScriptSerializer();
  readonly TextBlock title = new TextBlock(), english = new TextBlock(), detail = new TextBlock(), percent = new TextBlock();
  readonly Rectangle fill = new Rectangle();
  readonly TranslateTransform sweep = new TranslateTransform();
  readonly Grid bar = new Grid();
  bool ending, requested; int probePid; double phase;
  readonly DispatcherTimer timer = new DispatcherTimer();
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  static Brush Color(string value) { return (Brush)new BrushConverter().ConvertFromString(value); }
  static BitmapImage Load(string path) { var image = new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.UriSource=new Uri(path);image.EndInit();image.Freeze();return image; }
  void Emit(string kind) { try { Console.Out.WriteLine(json.Serialize(new { type=kind }));Console.Out.Flush(); } catch {} }
  public ProgressWindow(string mediaDirectory) {
   Width=720;Height=440;WindowStartupLocation=WindowStartupLocation.CenterScreen;
   WindowStyle=WindowStyle.None;ResizeMode=ResizeMode.NoResize;ShowInTaskbar=false;Title="Linker · 连接";
   Background=Color("#F5F8FB");FontFamily=new FontFamily("Microsoft YaHei UI");UseLayoutRounding=true;
   var outer=new Grid();Content=outer;
   if(File.Exists(System.IO.Path.Combine(mediaDirectory,"waiting-background.png"))) {
    outer.Children.Add(new Image { Source=Load(System.IO.Path.Combine(mediaDirectory,"waiting-background.png")),Stretch=Stretch.UniformToFill,Opacity=.8 });
   }
   outer.Children.Add(new Border { BorderBrush=Color("#CCDDE5"),BorderThickness=new Thickness(1),Background=Color("#58F5F8FB") });
   var center=new StackPanel { Width=380,VerticalAlignment=VerticalAlignment.Center,HorizontalAlignment=HorizontalAlignment.Center,Margin=new Thickness(0,-10,0,0) };
   outer.Children.Add(center);
   var logo=System.IO.Path.Combine(mediaDirectory,"waiting-logo.png");
   if(File.Exists(logo))center.Children.Add(new Image {Source=Load(logo),Width=49,Height=49,Margin=new Thickness(0,0,0,28)});
   title.Text="正在连接";title.FontSize=28;title.Foreground=Color("#263440");title.TextAlignment=TextAlignment.Center;center.Children.Add(title);
   english.Text="Connecting";english.FontFamily=new FontFamily("Segoe UI");english.FontSize=12;english.Foreground=Color("#7B929F");english.TextAlignment=TextAlignment.Center;english.Margin=new Thickness(0,7,0,30);center.Children.Add(english);
   bar.Width=360;bar.Height=2;bar.Background=Color("#D7E2E8");bar.ClipToBounds=true;
   fill.Fill=Color("#77AEC1");fill.Height=2;fill.Width=90;fill.HorizontalAlignment=HorizontalAlignment.Left;fill.RenderTransform=sweep;bar.Children.Add(fill);center.Children.Add(bar);
   var line=new Grid {Margin=new Thickness(10,13,10,0)};line.ColumnDefinitions.Add(new ColumnDefinition());line.ColumnDefinitions.Add(new ColumnDefinition {Width=GridLength.Auto});
   detail.Text="准备连接";detail.FontSize=12;detail.Foreground=Color("#6B8492");line.Children.Add(detail);
   percent.FontFamily=new FontFamily("Segoe UI");percent.FontSize=12;percent.Foreground=Color("#6B8492");Grid.SetColumn(percent,1);line.Children.Add(percent);center.Children.Add(line);
   var original=new Button {Content="本次使用原版  /  Original",FontSize=11,Foreground=Color("#708996"),Background=Brushes.Transparent,BorderThickness=new Thickness(0),Padding=new Thickness(10,8,10,8),HorizontalAlignment=HorizontalAlignment.Right,VerticalAlignment=VerticalAlignment.Bottom,Margin=new Thickness(0,0,20,13),Cursor=Cursors.Hand};
   original.Click+=(s,e)=>RequestOriginal();outer.Children.Add(original);
   outer.MouseLeftButtonDown+=(s,e)=>{if(original.IsMouseOver)return;try{DragMove();}catch{}};
   KeyDown+=(s,e)=>{if(e.Key==Key.Escape)RequestOriginal();};
   Closing+=(s,e)=>{if(!ending){e.Cancel=true;RequestOriginal();}};
   ContentRendered+=(s,e)=>Emit("ready");
   timer.Interval=TimeSpan.FromMilliseconds(40);timer.Tick+=(s,e)=>{
    if(percent.Text.Length==0){phase=(phase+4)%450;sweep.X=phase-90;fill.Width=90;}
    if(probePid>0)EnumWindows((w,p)=>{uint id;GetWindowThreadProcessId(w,out id);if(id==(uint)probePid)ShowWindow(w,0);return true;},IntPtr.Zero);
   };timer.Start();
   Task.Run(()=>{try { string text;while((text=Console.In.ReadLine())!=null){var value=json.Deserialize<Dictionary<string,object>>(text);Dispatcher.BeginInvoke(new Action(()=>Apply(value)));} }catch{}finally{Dispatcher.BeginInvoke(new Action(()=>Finish()));}});
  }
  void RequestOriginal(){if(requested)return;requested=true;Emit("original");detail.Text="正在打开原版";}
  void Apply(Dictionary<string,object> value){
   if(value.ContainsKey("close")&&Convert.ToBoolean(value["close"])){Finish();return;}
   if(value.ContainsKey("title"))title.Text=Convert.ToString(value["title"]);
   if(value.ContainsKey("english"))english.Text=Convert.ToString(value["english"]);
   if(value.ContainsKey("detail"))detail.Text=Convert.ToString(value["detail"]);
   if(value.ContainsKey("probePid"))probePid=Convert.ToInt32(value["probePid"]);
   if(value.ContainsKey("progress")){
    if(value["progress"]==null){percent.Text="";}
    else {double n=Math.Max(0,Math.Min(1,Convert.ToDouble(value["progress"])));percent.Text=Math.Floor(n*100)+"%";fill.Width=360*n;sweep.X=0;}
   }
   if(value.ContainsKey("snapshot")){
    var path=Convert.ToString(value["snapshot"]);var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render((Visual)Content);
    var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using(var file=File.Create(path))encoder.Save(file);Emit("snapshot");
   }
  }
  void Finish(){if(ending)return;ending=true;timer.Stop();probePid=0;var fade=new DoubleAnimation(1,0,TimeSpan.FromMilliseconds(140));fade.Completed+=(s,e)=>Close();BeginAnimation(OpacityProperty,fade);}
  [STAThread] public static void Main(string[] args){Console.SetIn(new StreamReader(Console.OpenStandardInput(),Encoding.UTF8));Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});var app=new Application();app.Run(new ProgressWindow(args.Length>0?args[0]:AppDomain.CurrentDomain.BaseDirectory));}
 }
}
