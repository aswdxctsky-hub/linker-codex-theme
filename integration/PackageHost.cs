using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Collections.Generic;

// Activated by Windows inside the official package. No injected code or TCP listener.
public static class PackageHost {
 public class Request { public string pipe; public string token; public string executable; public string[] args; public Dictionary<string,string> env; public bool debug; public string family; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetPackageFullName(IntPtr process,ref uint length,StringBuilder name);
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static void Send(Stream stream,object value) {var b=Encoding.UTF8.GetBytes(Json.Serialize(value)+"\0");stream.Write(b,0,b.Length);stream.Flush();}
 public static string Identity(Process p) {uint n=0;int result=GetPackageFullName(p.Handle,ref n,null);if(result!=122)throw new Exception("Package identity unavailable: "+result);var value=new StringBuilder((int)n);result=GetPackageFullName(p.Handle,ref n,value);if(result!=0)throw new Exception("Package identity unavailable: "+result);return value.ToString();}
 [STAThread] public static int Main(string[] args) {
  if(args.Length != 1) return 2;
  NamedPipeClientStream channel=null;
  try {
   var request=Json.Deserialize<Request>(File.ReadAllText(args[0]));File.Delete(args[0]);
   channel=new NamedPipeClientStream(".",request.pipe,PipeDirection.InOut,PipeOptions.Asynchronous);channel.Connect(15000);
   var hostIdentity=Identity(Process.GetCurrentProcess());
   var input=new AnonymousPipeServerStream(PipeDirection.Out,HandleInheritability.Inheritable);
   var output=new AnonymousPipeServerStream(PipeDirection.In,HandleInheritability.Inheritable);
   var arguments=new List<string>(request.args??new string[0]);
   if(request.debug){arguments.Insert(0,"--remote-debugging-pipe");arguments.Insert(1,"--remote-debugging-io-pipes="+input.GetClientHandleAsString()+","+output.GetClientHandleAsString());}
   var info=new ProcessStartInfo(request.executable,String.Join(" ",arguments.ConvertAll(Quote).ToArray()));
   info.UseShellExecute=false;info.CreateNoWindow=true;info.RedirectStandardOutput=true;info.RedirectStandardError=true;
   foreach(var pair in request.env)info.EnvironmentVariables[pair.Key]=pair.Value;
   var child=Process.Start(info);
   child.OutputDataReceived+=(s,e)=>{};child.ErrorDataReceived+=(s,e)=>{};child.BeginOutputReadLine();child.BeginErrorReadLine();
   input.DisposeLocalCopyOfClientHandle();output.DisposeLocalCopyOfClientHandle();
   string identity;
   try{identity=Identity(child);if(identity!=hostIdentity)throw new Exception("Child package identity mismatch");}catch{try{child.Kill();}catch{}throw;}
   Send(channel,new {hostReady=true,token=request.token,pid=child.Id,identity=identity,hostPid=Process.GetCurrentProcess().Id});
   if(!request.debug){channel.Dispose();input.Dispose();output.Dispose();child.WaitForExit();return 0;}
   var inbound=new Thread(()=>{try{channel.CopyTo(input);}catch{}finally{try{input.Dispose();}catch{}}});inbound.IsBackground=true;inbound.Start();
   try{output.CopyTo(channel);}catch{}finally{output.Dispose();channel.Dispose();}
   return 0;
  }catch(Exception error){try{if(channel!=null)Send(channel,new {hostError=error.Message});}catch{}try{File.WriteAllText(args[0]+".error",error.ToString());}catch{}return 1;}
 }
 public static string Quote(string value) {
  var result=new System.Text.StringBuilder("\""); int slashes=0;
  foreach(char c in value) {
   if(c=='\\') {slashes++;continue;}
   result.Append('\\',c=='"'?slashes*2+1:slashes);result.Append(c);slashes=0;
  }
  return result.Append('\\',slashes*2).Append('"').ToString();
 }
}
