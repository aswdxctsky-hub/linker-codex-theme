using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace Linker {
 [StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid Format; public uint Id; public PropertyKey(uint id){Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");Id=id;} }
 [StructLayout(LayoutKind.Explicit)] public struct PropVariant { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Pointer; [FieldOffset(16)] public long Extra; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPropertyStore {
  [PreserveSig]int GetCount(out uint count);
  [PreserveSig]int GetAt(uint index,out PropertyKey key);
  [PreserveSig]int GetValue(ref PropertyKey key,out PropVariant value);
  [PreserveSig]int SetValue(ref PropertyKey key,ref PropVariant value);
  [PreserveSig]int Commit();
 }
 [ComImport,Guid("00021401-0000-0000-C000-000000000046"),ClassInterface(ClassInterfaceType.None)] class ShellLink {}
 public static class ShortcutIdentity {
  [DllImport("ole32.dll")]static extern int PropVariantClear(ref PropVariant value);
  public static void Set(string path,string id){
   object link=new ShellLink();
   try{var file=(IPersistFile)link;file.Load(path,2);var store=(IPropertyStore)link;var key=new PropertyKey(5);var value=new PropVariant {Type=31,Pointer=Marshal.StringToCoTaskMemUni(id)};
    try{Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));Marshal.ThrowExceptionForHR(store.Commit());file.Save(path,true);}finally{PropVariantClear(ref value);}
   }finally{Marshal.FinalReleaseComObject(link);}
  }
  public static string Get(string path){
   object link=new ShellLink();
   try{((IPersistFile)link).Load(path,0);var store=(IPropertyStore)link;var key=new PropertyKey(5);PropVariant value;Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));try{return value.Type==31?Marshal.PtrToStringUni(value.Pointer):null;}finally{PropVariantClear(ref value);}}
   finally{Marshal.FinalReleaseComObject(link);}
  }
 }
}
