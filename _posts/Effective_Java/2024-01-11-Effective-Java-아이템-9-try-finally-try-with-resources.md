---
title: "Effective Java - 아이템 9: try-finally보다는 try-with-resources를 사용하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### try-finally
전통적으로 예외가 발생하거나 메서드에서 반환되는 경우를 포함해 자원이 제대로 닫힘을 보장하는 수단으로 `try-finally`가 쓰였다.
```java
// 더 이상 자원을 회수하는 최선의 방책이 아니다.
static String firstLineOfFile(String path) throws IOException {
    BufferedReader br = new BufferedReader(new FileReader(path));
   try {
       return br.readLine();
   } finally {
       br.close();
   }
}
```

```java
// 자원이 둘 이상이면 try-finally 방식은 너무 지저분하다.
static void copy(String src, String dst) throws IOException {
   InputStream in = new FileInputStream(src);
   try {
      OutputStream out = new FileoutputStream(dst);
      try {
         byte[] buf = new byte[BUFFER_SIZE];
         int n;
         while ((n = in.read(buf)) >= 0) {
            out.write(buf, 0, n);
         }
      } finally {
         out.close();
      }
   } finally{
      in.close();
   }
}
```
위 코드에서 예외는 try 블록과 finally 블록 모두에서 발생할 수 있는데,<br>
안과 밖에서 두 개의 예외가 발생할 경우 두 번째 예외가 첫 번째 예외를 완전히 집어삼켜 버린다.<br>
그러면 스택 추적 내역에 첫 번째 예외에 관한 정보는 남지 않게 되어 디버깅을 어렵게 한다.<br>

### try-with-resources
위와 같은 문제를 `try-with-resources`를 사용하여 모두 해결할 수 있다.<br>
이 구조를 사용하려면 해당 자원이 `AutoCloseable` 인터페이스를 구현해야 한다.<br>
`AutoClosable` 인터페이스는 void를 반환하는 `close` 메서드 하나만 정의되어 있다.<br>
닫아야 하는 자원을 뜻하는 클래스를 작성한다면 `AutoCloseable`을 구현하라.<br>

```java
// 위의 코드를 try-with-resources로 재작성
static String firstLineOfFile(String path) throws IOException {
   try (BufferedReader br = new BufferedReader(new FileReader(path))) {
       return br.readLine();
   }
}
```

```java
static void copy(String src, String dst) throws IOException {
   try (InputStream in = new FileInputStream(src);
        OutputStream out = new FileOutputStream(dst)) {
      byte[] buf = new byte[BUFFER_SIZE];
      int n;
      while ((n = in.read(buf)) >= 0) {
         out.write(buf, 0, n);
      }
   }
}
```

`try-with-resources`를 사용한 코드가 가독성이 훨씬 좋다.<br>
`firstLineOfFile` 메서드에서 `readLine`과 코드에는 나타나지 않은 `close` 호출 양쪽에서 예외가 발생하면,<br>
`close`에서 발생한 예외는 숨겨지고 `readLine`에서 발생한 예외가 기록된다.<br>
이처럼 실전에서는 프로그래머에게 보여줄 예외 하나만 보존되고 여러 개의 다른 예외가 숨겨질 수도 있다.<br>
하지만 숨겨진 예외들은 버려지지 않고 스택 추적 내역에 숨겨졌다(suppressed)는 꼬리표를 달고 출력된다.<br>
자바 7에서 `Throwable`에 추가된 `getSuppressed` 메서드를 이용하면 프로그램 코드에서 가져올 수도 있다.<br>

### catch 절
보통의 `try-finally`에서처럼 `try-with-resources`에서도 `catch` 절을 사용해 `try`문을 중첩하지 않고도 다수의 예외를 처리할 수 있다.

```java
// try-with-resources를 catch절과 함께 쓰는 모습
// 파일을 열거나 데이터를 읽지 못했을 때 예외를 던지는 대신 기본값을 반환하는 예시 코드
static String firstLineOfFile(String path, String defaultVal) {
   try (BufferedReader br = new BufferedReader(new FileReader(path))) {
      return br.readLine();
   } catch (IOException e) {
      return defaultVal;
   }
}
```

### 핵심 정리
**꼭 회수해야 하는 자원을 다룰 때는 `try-finally` 말고, `try-with-resources`를 사용하자.**<br>
`try-finally`로 작성하면 지저분해지는 코드도 `try-with-resources`로는 정확하고 쉽게 자원을 회수할 수 있다.<br>
