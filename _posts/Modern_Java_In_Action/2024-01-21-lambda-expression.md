---
title: "Modern Java In Action - 람다 표현식"
categories:
  - Modern Java In Action
tags:
  - 람다
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

람다 표현식은 메서드로 전달할 수 있는 익명 함수를 단순화한 것이라고 할 수 있다.
- 익명: 보통의 메서드와 달리 이름이 없으므로 익명이라 표현한다. 
- 함수: 람다는 메서드처럼 특정 클래스에 종속되지 않으므로 함수라 한다. 하지만 메서드처럼 파라미터 리스트, 바디, 반환 형식, 가능한 예외 리스트를 포함한다.
- 전달: 람다 표현식을 메서드 인수로 전달하거나 변수로 저장할 수 있다.
- 간결성

```java
// 기존에 익명 클래스를 사용한 코드
Comparator<Apple> byWeight = new Comparator<Apple>() {
    public int compare(Apple a1, Apple a2) {
        return a1.getWegiht().compareTo(a2.getWeight());
    }
};

// 람다를 사용한 코드
Comparator<Apple> byWeight = (Apple a1, Apple a2) -> a1.getWeight().compareTo(a2.getWeight());
```

람다 표현식은 파라미터, 화살표, 바디로 이루어진다.
- 파라미터 리스트: Comparator의 compare 메서드 파라미터(사과 두 개)
- 화살표: 화살표는 람다의 파라미터 리스트와 바디를 구분
- 람다 바디: 두 사과의 무게를 비교한다. 람다의 반환값에 해당하는 표현식

### 람다를 어떻게 사용할까?
람다는 함수형 인터페이스라는 문맥에서 사용할 수 있다.

```java
// ApplePredicate를 파라미터로 받도록 수정한 메서드
public static List<Apple> filterApples(List<Apple> inventory, ApplePredicate predicate) {
    List<Apple> result = new ArrayList<>();
    for (Apple apple : inventory) {
        if (predicate.test()) { // ApplePredicate를 구현한 구체 클래스에서 정의한 메서드를 기준으로 동작한다. 
            result.add(apple);
        }
    }
    return result;
}

// ApplePredicate 인터페이스를 받는 매개변수에 람다 사용
List<Apple> greenApples = filterApples(inventory, (Apple a) -> GREEN.equals(a.getColor()));
```

### 함수형 인터페이스
함수형 인터페이스는 정확히 하나의 추상 메서드를 지정하는 인터페이스다.

```java
public interface Comparator<T> { // java.util.Comparator
    int compare(T o1, T o2);
}

public interface Runnable { // java.lang.Runnable
    void run();
}

public interface ActionListener extends EventListener { // java.awt.event.ActionListener
    void actionPerformed(ActionEvent e);
}

public interface Callable<V> { // java.util.concurrent.Callable
    V call() throws Exception;
}

public interface PrivilegedAction<T> { // java.security.PrivilegedAction
    T run();
}
```

> 디폴트 메서드는 함수형 인터페이스의 조건에 영향을 주지 않는다.
> 디폴트 메서드가 여러개 정의되어 있더라도, 오직 단 한개의 추상메서드만 정의되어 있으면
> 그 인터페이스는 함수형 인터페이스다.

람다 표현식으로 함수형 인터페이스의 추상 메서드 구현을 직접 전달할 수 있으므로 전체 표현식을 함수형 인터페이스의 인스턴스로 취급할 수 있다.

```java
Runnable r1 = () -> System.out.println("Hello World 1"); // 람다 사용

Runnable r2 = new Runnable() { // 익명 클래스 사용
    public void run() {
        System.out.println("Hello World 2");
    }
};

public static void process(Runnable r) {
    r.run();
}
process(r1); // Hello World 1 출력
process(r2); // Hello World 2 출력
process(() -> System.out.println("Hello World 3")); // 직접 전달된 람다 표현식으로 Hello World 3 출력
```

### 함수 디스크립터
함수형 인터페이스의 추상 메서드 시그니처는 람다 표현식의 시그니처를 가리킨다. 
람다 표현식의 시그니처를 서술하는 메서드를 함수 디스크립터라고 부른다.


### @FunctionalInterface
@FunctionalInterface는 함수형 인터페이스임을 가리키는 어노테이션이다.
추상 메서드가 한 개 이상이라면 "Multiple nonoverriding abstract methods found in interface Foo"같은 에러가 발생할 수 있다.

### 실행 어라운드 패턴
실제 자원을 처리하는 코드를 설정과 정리 두 과정이 둘러싸는 형태인 코드를 실행 어라운드 패턴이라고 부른다.

```java
public String processFile() throws IOException {
    try (BufferedReader br = new BufferedReader(new FileReader("data.txt"))) { // try-with-resources 사용
        return br.readLine();
    }
}
```

BufferedReader를 이용해서 다른 동작을 수행할 수 있도록 processFile 메서드로 동작을 전달해야 한다.
람다를 이용해서 동작을 전달할 수 있다.

```java
String result = processFile((BufferedReader br) -> br.readLine() + br.readLine());
```

### 함수옇 인터페이스를 이용해서 동작 전달

```java
@FunctionalInterface
public interface BufferedReaderProcessor {
    String process(BufferedReader b) throws IOException;
}

public String processFile(BufferedReaderProcessor p) throws IOException {
    ...
}
```

정의한 인터페이스를 processFile 메서드의 인수로 전달할 수 있다.
이제 BufferedReaderProcessor에 정의된 process 메서드의 시그니처 (BufferedReader -> String)와 일치하는 람다를 전달할 수 있다.
람다 표현식으로 함수형 인터페이스의 추상 메서드 구현을 직접 전달할 수 있으며 전달된 코드는 함수형 인터페이스의 인스턴스로 전달된 코드와 같은 방식으로 처리한다.
따라서 processFile 바디 내에서 BufferedReaderProcessor 객체의 process를 호출할 수 있다.

```java
public String processFile(BufferedReaderProcessor p) throws IOException {
    try (BufferedReader br = new BufferedReader(new FileReader("data.txt"))) {
        return p.process(br);
    }
}
```

이제 람다를 이용해서 다양한 동작을 processFile 메서드로 전달할 수 있다.

```java
// 한 행을 처리하는 코드
String oneLine = processFile((BufferedReader br) -> br.readLine());

// 두 행을 처리하는 코드
String twoLine = processFile((BufferedReader br) -> br.readLine() + br.readLine());
```

### 함수형 인터페이스 사용
함수형 인터페이스의 추상 메서드 시그니처를 함수 디스크립터(function descriptor)라고 한다.

### Predicate
java.util.function.Predicate<T> 인터페이스는 test라는 추상 메서드를 정의하며 test는 제네릭 형식 T의 객체를 인수로 받아 boolean을 반환한다.

```java
@FunctionalInterface
public interface Predicate<T> {
    boolean test(T t);
}

public <T> List<T> filter(List<T> list, Predicate<T> p) {
    List<T> results = new ArrayList<>();
    for (T t : list) {
        if (p.test(t)) {
            results.add(t);
        }
    }
    return results;
}

Predicate<String> nonEmptyStringPredicate = (String s) -> !s.isEmpty();
List<String> nonEmpty = filter(listOfStrings, nonEmptyStringPredicate);
```

### Consumer
java.util.function.Consumer<T> 인터페이스는 제네릭 형식 T 객체를 받아서 void를 반환하는 accept라는 추상 메서드를 정의한다.

```java
@FunctionalInterface
public interface Consumer<T> {
    void accept(T t);
}

public <T> void forEach(List<T> list, Consumer<T> c) {
    for (T t : list) {
        c.accept(t);
    }
}

forEach(
        Arrays.asList(1,2,3,4,5),
        (Integer i) -> System.out.println(i); // Consumer의 accept 메서드를 구현하는 람다
);
```

### Function
java.util.function.Function<T, R> 인터페이스는 제네릭 형식 T를 인수로 받아서 제네릭 형식 R 객체를 반환하는 추상 메서드 apply를 정의한다.
입력을 출력으로 매핑하는 람다를 정의할 때 Function 인터페이스를 활용할 수 있다.

```java
@FunctionalInterface
public interface Function<T, R> {
    R apply(T t);
}

public <T, R> List<R> map(List<T> list, Function<T, R> f) {
    List<R> result = new ArrayList<>();
    for (T t : list) {
        result.add(f.apply(t));
    }
    return result;
}

// [7, 2, 6]
List<Integer> l = map(
        Arrays.asList("lambdas", "in", "action"),
        (String s) -> s.length(); // Function의 apply 메서드를 구현하는 람다
)
```

### 기본형 특화
자바에서는 기본형을 참조형으로 변환하는 기능을 제공한다. 이 기능을 박싱(boxing)이라고 한다.
참조형을 기본형으로 변환하는 반대 동작을 언박싱(unboxing)이라고 한다.
박싱과 언박싱이 자동으로 이루어지는 오토박싱(autoboxing)이라는 기능도 제공한다.

```java
List<Integer> list = new ArrayList<>();
for (int i = 300; i < 400; i++) {
    list.add(i); // 박싱비용 소모
}
```

이런 변환 과정은 비용이 소모된다. 박싱한 값은 기본형을 감싸는 래퍼며 힙에 저장된다.
따라서 박싱한 값은 메모리를 더 소비하며 기본형을 가져올 때도 메모리를 탐색하는 과정이 필요하다.

자바 8에서는 기본형을 입출력으로 사용하는 사오항에서 오토박싱 동작을 피할 수 있도록 특별한 버전의 함수형 인터페이스를 제공한다.
일반적으로 특정 형식을 입력으로 받는 함수형 인터페이스의 이름 앞에는 DoublePredicate, IntConsumer, LongBinaryOperator, IntFunction처럼 형식명이 붙는다.
